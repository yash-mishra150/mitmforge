//! Phase 1 proxy engine: MITM HTTP/S proxy logging decrypted traffic to stdout.
//! In-memory CA (regenerated per run); certificate persistence and UI wiring come later.

use hudsucker::{
    certificate_authority::RcgenAuthority,
    hyper::{Request, Response},
    rcgen::{BasicConstraints, CertificateParams, IsCa, Issuer, KeyPair},
    rustls::crypto::aws_lc_rs,
    Body, HttpContext, HttpHandler, Proxy, RequestOrResponse,
};
use std::net::SocketAddr;

#[derive(Clone)]
struct LogHandler;

impl HttpHandler for LogHandler {
    async fn handle_request(
        &mut self,
        _ctx: &HttpContext,
        req: Request<Body>,
    ) -> RequestOrResponse {
        println!("➡️ Intercepted: {} {}", req.method(), req.uri());
        req.into()
    }

    async fn handle_response(
        &mut self,
        _ctx: &HttpContext,
        res: Response<Body>,
    ) -> Response<Body> {
        println!("⬅️ Response: {}", res.status());
        res
    }
}

/// Generates a fresh in-memory Root CA and starts the proxy on 127.0.0.1:8080.
/// Runs forever until the app exits (no signal handling inside the Tauri process).
pub async fn start_proxy() {
    let key_pair = KeyPair::generate().expect("generate CA key pair");
    let mut params = CertificateParams::new(Vec::<String>::new()).expect("CA certificate params");
    params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    let cert = params.self_signed(&key_pair).expect("self-signed CA");
    let issuer = Issuer::from_ca_cert_pem(&cert.pem(), key_pair).expect("CA issuer");
    let ca = RcgenAuthority::new(issuer, 1_000, aws_lc_rs::default_provider());

    let addr: SocketAddr = "127.0.0.1:8080".parse().unwrap();
    println!("🚀 MitmForge Proxy Engine listening on {addr}");

    let proxy = Proxy::builder()
        .with_addr(addr)
        .with_ca(ca)
        .with_rustls_connector(aws_lc_rs::default_provider())
        .with_http_handler(LogHandler)
        .with_graceful_shutdown(std::future::pending::<()>())
        .build()
        .expect("build proxy");

    if let Err(e) = proxy.start().await {
        eprintln!("Proxy failed to start: {e}");
    }
}
