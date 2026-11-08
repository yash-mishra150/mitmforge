//! MITM proxy engine. Tauri-free: emits `ProxyEvent`s through a `Sink` closure
//! so the engine stays testable headless. CA is in-memory (regenerated per
//! run); persistence comes with the certificate export flow.

use hudsucker::{
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
    certificate_authority::RcgenAuthority,
    hyper::{Request, Response, StatusCode},
    rcgen::{BasicConstraints, CertificateParams, IsCa, Issuer, KeyPair},
    rustls::crypto::aws_lc_rs,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::{
    collections::VecDeque,
    net::SocketAddr,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

/// One intercepted exchange. `Response` events patch the row by `id`.
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
pub struct TrafficEntry {
    pub id: u64,
    pub method: String,
    pub url: String,
    pub started_at_ms: u64,
}

/// Backend → UI events. Serialized as a tagged enum (`type` field).
#[derive(Clone, Debug, Serialize, Deserialize, Type)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ProxyEvent {
    Request { entry: TrafficEntry },
    Response { id: u64, status: u16 },
}

/// Where the engine publishes events (Tauri in the app, no-op in tests).
pub type Sink = Arc<dyn Fn(ProxyEvent) + Send + Sync>;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Per-connection handler: hudsucker passes each request/response pair to the
/// same handler instance, so a FIFO queue correlates response → request id.
/// Sequential HTTP/1.1 only; HTTP/2 multiplexing needs different plumbing
/// (hudsucker's `http2` feature, not enabled yet).
#[derive(Clone)]
struct EmitHandler {
    sink: Sink,
    pending: VecDeque<u64>,
}

impl HttpHandler for EmitHandler {
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        req: Request<Body>,
    ) -> RequestOrResponse {
        let entry = TrafficEntry {
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
            method: req.method().to_string(),
            url: req.uri().to_string(),
            started_at_ms: now_ms(),
        };
        self.pending.push_back(entry.id);
        (self.sink)(ProxyEvent::Request { entry });
        req.into()
    }

    async fn handle_response(&mut self, _ctx: &HttpContext, res: Response<Body>) -> Response<Body> {
        if let Some(id) = self.pending.pop_front() {
            (self.sink)(ProxyEvent::Response {
                id,
                status: res.status().as_u16(),
            });
        }
        res
    }

    async fn handle_error(
        &mut self,
        _ctx: &HttpContext,
        _err: hudsucker::hyper_util::client::legacy::Error,
    ) -> Response<Body> {
        // Upstream failed: still emit a status (502) so the queue stays balanced.
        if let Some(id) = self.pending.pop_front() {
            (self.sink)(ProxyEvent::Response { id, status: 502 });
        }
        Response::builder()
            .status(StatusCode::BAD_GATEWAY)
            .body(Body::empty())
            .expect("build 502 response")
    }
}

/// Generates a fresh in-memory Root CA and starts the proxy on `addr`.
/// Runs until the app exits; `sink` receives one event per exchange.
pub async fn start(sink: Sink, addr: SocketAddr) -> Result<(), String> {
    let key_pair = KeyPair::generate().map_err(|e| format!("generate CA key pair: {e}"))?;
    let mut params =
        CertificateParams::new(Vec::<String>::new()).map_err(|e| format!("CA params: {e}"))?;
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let cert = params
        .self_signed(&key_pair)
        .map_err(|e| format!("self-signed CA: {e}"))?;
    let issuer =
        Issuer::from_ca_cert_pem(&cert.pem(), key_pair).map_err(|e| format!("CA issuer: {e}"))?;
    let ca = RcgenAuthority::new(issuer, 1_000, aws_lc_rs::default_provider());

    println!("🚀 MitmForge Proxy Engine listening on {addr}");

    let proxy = Proxy::builder()
        .with_addr(addr)
        .with_ca(ca)
        .with_rustls_connector(aws_lc_rs::default_provider())
        .with_http_handler(EmitHandler {
            sink,
            pending: VecDeque::new(),
        })
        .with_graceful_shutdown(std::future::pending::<()>())
        .build()
        .map_err(|e| format!("build proxy: {e}"))?;

    proxy.start().await.map_err(|e| format!("proxy start: {e}"))
}
