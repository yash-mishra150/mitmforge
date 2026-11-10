//! MITM proxy engine. Tauri-free: emits `ProxyEvent`s through a `Sink`
//! closure so the engine stays testable headless.
//!
//! Bodies: tee capture — chunks forward untouched while up to `MAX_CAPTURED`
//! bytes are copied aside into a shared [`BodyStore`]; the UI fetches them
//! lazily via `traffic_body` (BRD: lazy-load heavy payloads on click).

use http_body_util::BodyExt;
use hudsucker::{
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
    certificate_authority::RcgenAuthority,
    futures::StreamExt,
    hyper::{Request, Response, StatusCode, header},
    rcgen::{BasicConstraints, CertificateParams, DnType, IsCa, Issuer, KeyPair, KeyUsagePurpose},
    rustls::crypto::aws_lc_rs,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::{HashMap, VecDeque},
    future::Future,
    net::SocketAddr,
    path::Path,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::{Instant, SystemTime, UNIX_EPOCH},
};

/// Captured body bytes are capped at this size; larger bodies still forward
/// completely, just without full capture.
const MAX_CAPTURED: usize = 64 * 1024;
/// How many exchanges keep their captured bodies; oldest are evicted.
const MAX_STORED: usize = 500;

/// One intercepted exchange. `Response` events patch the row by `id`.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TrafficEntry {
    pub id: u64,
    pub method: String,
    pub url: String,
    pub started_at_ms: u64,
    /// "tunnel" for CONNECT rows, otherwise the URI scheme ("http"/"https").
    pub scheme: String,
    /// From the request's content-type header, if present.
    pub req_content_type: Option<String>,
    /// From the request's content-length header, if present.
    pub req_size: Option<u64>,
}

/// Backend → UI events. Serialized as a tagged enum (`type` field).
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProxyEvent {
    Request {
        entry: TrafficEntry,
    },
    Response {
        id: u64,
        status: u16,
        duration_ms: Option<u64>,
        /// From the response's content-type header, if present.
        res_content_type: Option<String>,
        /// From the response's content-length header, if present.
        res_size: Option<u64>,
    },
}

/// Where the engine publishes events (Tauri in the app, no-op in tests).
pub type Sink = Arc<dyn Fn(ProxyEvent) + Send + Sync>;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
/// Decrypt HTTPS only when the CA is trusted; otherwise blind-tunnel
/// (Proxyman's default): real certificates reach the client, nothing
/// breaks, and CONNECT rows still log domains.
static INTERCEPT_TLS: AtomicBool = AtomicBool::new(false);

pub fn set_intercept_tls(enabled: bool) {
    INTERCEPT_TLS.store(enabled, Ordering::SeqCst);
}

fn intercept_tls() -> bool {
    INTERCEPT_TLS.load(Ordering::SeqCst)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Serializes headers for the inspector (lossy; capped by the reader).
fn headers_text(headers: &hudsucker::hyper::header::HeaderMap) -> String {
    use std::fmt::Write;
    let mut s = String::new();
    for (name, value) in headers {
        let _ = writeln!(
            s,
            "{}: {}",
            name,
            value.to_str().unwrap_or("<binary value>")
        );
    }
    s
}

fn capture_text(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }
    let text = if bytes.len() >= MAX_CAPTURED {
        format!(
            "{}\n[… capture truncated at {} bytes]",
            String::from_utf8_lossy(bytes),
            MAX_CAPTURED
        )
    } else {
        String::from_utf8_lossy(bytes).to_string()
    };
    Some(text)
}

/// Wraps a body so every chunk forwards unchanged while being copied into
/// `captured` (capped; past the cap we forward only).
fn tee(body: Body, captured: Arc<Mutex<Vec<u8>>>) -> Body {
    let stream = body.into_data_stream().map(move |chunk| {
        if let Ok(chunk) = &chunk {
            let mut buf = captured.lock().unwrap();
            if buf.len() < MAX_CAPTURED {
                let room = MAX_CAPTURED - buf.len();
                buf.extend_from_slice(&chunk[..chunk.len().min(room)]);
            }
        }
        chunk
    });
    Body::from_stream(stream)
}

/// Only decodes encodings hudsucker supports; on unsupported values
/// `decode_*` would consume (and lose) the original body, so gate first.
fn decodable(content_encoding: Option<&str>) -> bool {
    match content_encoding {
        None => true,
        Some(v) => v.split(',').all(|e| {
            matches!(
                e.trim(),
                "identity" | "gzip" | "x-gzip" | "deflate" | "br" | "zstd"
            )
        }),
    }
}

/// Lazily-fetched captured data for one exchange (lossy UTF-8 on read).
#[derive(Default)]
pub struct Captured {
    pub req_headers: Option<String>,
    pub req: Arc<Mutex<Vec<u8>>>,
    pub res_headers: Option<String>,
    pub res: Arc<Mutex<Vec<u8>>>,
}

/// Body store shared between the engine and the `traffic_body` command.
/// shortcut: bodies die with the app (no persistence) and res bodies are a
/// snapshot at read time (slow streams may be incomplete until re-fetched).
pub struct BodyStore {
    map: HashMap<u64, Captured>,
    order: VecDeque<u64>,
}

pub type SharedStore = Arc<Mutex<BodyStore>>;

impl BodyStore {
    pub fn shared() -> SharedStore {
        Arc::new(Mutex::new(BodyStore {
            map: HashMap::new(),
            order: VecDeque::new(),
        }))
    }

    fn insert_request(&mut self, id: u64, req_headers: String, req: Arc<Mutex<Vec<u8>>>) {
        self.map.insert(
            id,
            Captured {
                req_headers: Some(req_headers),
                req,
                res_headers: None,
                res: Arc::default(),
            },
        );
        self.order.push_back(id);
        while self.order.len() > MAX_STORED {
            let evict = self.order.pop_front().unwrap();
            self.map.remove(&evict);
        }
    }

    fn complete(&mut self, id: u64, res_headers: String, res: Arc<Mutex<Vec<u8>>>) {
        if let Some(captured) = self.map.get_mut(&id) {
            captured.res_headers = Some(res_headers);
            captured.res = res;
        }
    }

    pub fn get(&self, id: u64) -> Option<BodyText> {
        let captured = self.map.get(&id)?;
        let req_body = {
            let buf = captured.req.lock().unwrap();
            capture_text(&buf)
        };
        let res_body = {
            let buf = captured.res.lock().unwrap();
            capture_text(&buf)
        };
        Some(BodyText {
            req_headers: captured.req_headers.clone(),
            req_body,
            res_headers: captured.res_headers.clone(),
            res_body,
        })
    }
}

/// Lossy-UTF-8 header/body snapshots for the inspector.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct BodyText {
    pub req_headers: Option<String>,
    pub req_body: Option<String>,
    pub res_headers: Option<String>,
    pub res_body: Option<String>,
}

#[derive(Clone)]
struct Pending {
    id: u64,
    started: Instant,
}

/// Per-connection handler: hudsucker passes each request/response pair to the
/// same handler instance, so a FIFO queue correlates response → request id.
/// Sequential HTTP/1.1 only; HTTP/2 multiplexing needs different plumbing
/// (hudsucker's `http2` feature, not enabled yet).
#[derive(Clone)]
struct EmitHandler {
    sink: Sink,
    store: SharedStore,
    pending: VecDeque<Pending>,
}

impl HttpHandler for EmitHandler {
    async fn should_intercept_connect(&mut self, _ctx: &HttpContext, _req: &Request<Body>) -> bool {
        intercept_tls()
    }

    async fn should_intercept_tls(
        &mut self,
        _ctx: &HttpContext,
        _client_hello: hudsucker::rustls::server::ClientHello<'_>,
    ) -> bool {
        intercept_tls()
    }
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        req: Request<Body>,
    ) -> RequestOrResponse {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let method = req.method().to_string();
        let url = req.uri().to_string();
        // CONNECT tunnels carry an authority-form URI (no scheme); label them
        // "tunnel" so the UI can build an SSL column off `scheme`.
        let scheme = if method == "CONNECT" {
            "tunnel".to_string()
        } else {
            req.uri().scheme_str().unwrap_or("").to_string()
        };
        let req_content_type = req
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let req_size = req
            .headers()
            .get(header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        let entry = TrafficEntry {
            id,
            method,
            url,
            started_at_ms: now_ms(),
            scheme,
            req_content_type,
            req_size,
        };
        // CONNECT tunnel: logged like Proxyman (with headers); we intercept,
        // so it answers 200 and the decrypted requests follow as their own
        // rows. Kept out of the pending queue so correlation stays correct.
        let req_capture: Arc<Mutex<Vec<u8>>> = Arc::default();
        if req.method().as_str() == "CONNECT" {
            self.store
                .lock()
                .unwrap()
                .insert_request(id, headers_text(req.headers()), req_capture);
            (self.sink)(ProxyEvent::Request { entry });
            (self.sink)(ProxyEvent::Response {
                id,
                status: 200,
                duration_ms: None,
                res_content_type: None,
                res_size: None,
            });
            return RequestOrResponse::Request(req);
        }
        self.pending.push_back(Pending {
            id: entry.id,
            started: Instant::now(),
        });
        self.store.lock().unwrap().insert_request(
            entry.id,
            headers_text(req.headers()),
            req_capture.clone(),
        );
        (self.sink)(ProxyEvent::Request { entry });

        let encoding = req
            .headers()
            .get("content-encoding")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let req = if decodable(encoding.as_deref()) {
            // Gate makes Err unreachable (all listed encodings are supported);
            // if it still happens the body is already lost, so fail the
            // exchange visibly instead of corrupting it.
            match hudsucker::decode_request(req) {
                Ok(req) => req,
                Err(e) => {
                    eprintln!("decode_request failed unexpectedly: {e}");
                    return RequestOrResponse::Response(
                        Response::builder()
                            .status(StatusCode::BAD_GATEWAY)
                            .body(Body::empty())
                            .expect("build 502 response"),
                    );
                }
            }
        } else {
            req
        };
        let (parts, body) = req.into_parts();
        let body = tee(body, req_capture);
        RequestOrResponse::Request(Request::from_parts(parts, body))
    }

    async fn handle_response(&mut self, _ctx: &HttpContext, res: Response<Body>) -> Response<Body> {
        let pending = self.pending.pop_front();
        let status = res.status().as_u16();
        let encoding = res
            .headers()
            .get("content-encoding")
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let res = if decodable(encoding.as_deref()) {
            match hudsucker::decode_response(res) {
                Ok(res) => res,
                Err(e) => {
                    eprintln!("decode_response failed unexpectedly: {e}");
                    return Response::builder()
                        .status(StatusCode::BAD_GATEWAY)
                        .body(Body::empty())
                        .expect("build 502 response");
                }
            }
        } else {
            res
        };

        let res_headers = headers_text(res.headers());
        // Capture from the real headers before consuming the response into
        // parts / teeing the body, so values reflect what the upstream sent.
        let res_content_type = res
            .headers()
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .map(str::to_owned);
        let res_size = res
            .headers()
            .get(header::CONTENT_LENGTH)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.parse::<u64>().ok());
        let (parts, body) = res.into_parts();
        let res_capture: Arc<Mutex<Vec<u8>>> = Arc::default();
        let body = tee(body, res_capture.clone());
        if let Some(p) = &pending {
            self.store
                .lock()
                .unwrap()
                .complete(p.id, res_headers, res_capture);
        }
        let duration_ms = pending
            .as_ref()
            .map(|p| p.started.elapsed().as_millis() as u64);
        (self.sink)(ProxyEvent::Response {
            id: pending.map(|p| p.id).unwrap_or(0),
            status,
            duration_ms,
            res_content_type,
            res_size,
        });
        Response::from_parts(parts, body)
    }

    async fn handle_error(
        &mut self,
        _ctx: &HttpContext,
        _err: hudsucker::hyper_util::client::legacy::Error,
    ) -> Response<Body> {
        // Upstream failed: still emit a status (502) so the queue stays balanced.
        let pending = self.pending.pop_front();
        if let Some(p) = &pending {
            self.store
                .lock()
                .unwrap()
                .complete(p.id, String::new(), Arc::default());
        }
        let duration_ms = pending
            .as_ref()
            .map(|p| p.started.elapsed().as_millis() as u64);
        (self.sink)(ProxyEvent::Response {
            id: pending.map(|p| p.id).unwrap_or(0),
            status: 502,
            duration_ms,
            res_content_type: None,
            res_size: None,
        });
        Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Body::empty())
            .expect("build 502 response")
    }
}

/// Loads the persisted CA (`ca.cer` + `ca.key`) from `dir`, or creates and
/// saves it there. `None` = ephemeral in-memory CA (tests).
/// shortcut: the CA private key is stored unencrypted on disk (like
/// Proxyman/Charles); acceptable for a local debugging tool.
fn load_or_create_ca(dir: Option<&Path>) -> Result<Issuer<'static, KeyPair>, String> {
    let (cer_path, key_path) = match dir {
        Some(dir) => (dir.join("ca.cer"), dir.join("ca.key")),
        None => return fresh_ca(None),
    };
    if cer_path.exists() && key_path.exists() {
        let key_pem =
            std::fs::read_to_string(&key_path).map_err(|e| format!("read CA key: {e}"))?;
        let cer_pem =
            std::fs::read_to_string(&cer_path).map_err(|e| format!("read CA cert: {e}"))?;
        let key_pair = KeyPair::from_pem(&key_pem).map_err(|e| format!("parse CA key: {e}"))?;
        return Issuer::from_ca_cert_pem(&cer_pem, key_pair)
            .map_err(|e| format!("parse CA cert: {e}"));
    }
    fresh_ca(Some(&cer_path))
}

/// Generates a new CA, persisting it when `cer_path` is given.
fn fresh_ca(cer_path: Option<&Path>) -> Result<Issuer<'static, KeyPair>, String> {
    let key_pair = KeyPair::generate().map_err(|e| format!("generate CA key pair: {e}"))?;
    let mut params =
        CertificateParams::new(Vec::<String>::new()).map_err(|e| format!("CA params: {e}"))?;
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    params
        .distinguished_name
        .push(DnType::CommonName, "MitmForge Root CA");
    // Windows rejects CA chains without keyCertSign (schannel enforces key
    // usage); rcgen leaves key_usages empty by default.
    params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::KeyCertSign,
        KeyUsagePurpose::CrlSign,
    ];
    let cert = params
        .self_signed(&key_pair)
        .map_err(|e| format!("self-signed CA: {e}"))?;
    if let Some(cer_path) = cer_path {
        if let Some(dir) = cer_path.parent() {
            std::fs::create_dir_all(dir).map_err(|e| format!("create CA dir: {e}"))?;
        }
        let key_path = cer_path.with_file_name("ca.key");
        std::fs::write(cer_path, cert.pem()).map_err(|e| format!("save CA cert: {e}"))?;
        std::fs::write(key_path, key_pair.serialize_pem())
            .map_err(|e| format!("save CA key: {e}"))?;
    }
    Ok(Issuer::new(params, key_pair))
}

/// Generates/loads the CA and starts the proxy on `addr`. Runs until
/// `shutdown` resolves; `sink` receives one event per exchange.
pub async fn start(
    sink: Sink,
    addr: SocketAddr,
    ca_dir: Option<&Path>,
    store: SharedStore,
    shutdown: impl Future<Output = ()> + Send + 'static,
) -> Result<(), String> {
    let issuer = load_or_create_ca(ca_dir)?;
    let ca = RcgenAuthority::new(issuer, 1_000, aws_lc_rs::default_provider());

    println!("🚀 MitmForge Proxy Engine listening on {addr}");

    let proxy = Proxy::builder()
        .with_addr(addr)
        .with_ca(ca)
        .with_rustls_connector(aws_lc_rs::default_provider())
        .with_http_handler(EmitHandler {
            sink,
            store,
            pending: VecDeque::new(),
        })
        .with_graceful_shutdown(shutdown)
        .build()
        .map_err(|e| format!("build proxy: {e}"))?;

    proxy.start().await.map_err(|e| format!("proxy start: {e}"))
}
