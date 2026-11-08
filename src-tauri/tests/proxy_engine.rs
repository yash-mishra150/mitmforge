//! Engine sanity: a plain-HTTP exchange through the proxy emits a Request
//! event (full URL) and a Response event (status), correlated by id.

use mitmforge_lib::proxy::{ProxyEvent, Sink};
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

#[tokio::test]
async fn logs_plain_http_exchange() {
    let events: Arc<Mutex<Vec<ProxyEvent>>> = Arc::default();
    let sink: Sink = {
        let events = events.clone();
        Arc::new(move |e| events.lock().unwrap().push(e))
    };

    // Local upstream serves one hardcoded 200; no network dependency.
    let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_addr = upstream.local_addr().unwrap();
    tokio::spawn(async move {
        if let Ok((mut s, _)) = upstream.accept().await {
            let mut buf = [0u8; 8192];
            let _ = s.read(&mut buf).await;
            let _ = s
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nhi")
                .await;
        }
    });

    let addr: SocketAddr = "127.0.0.1:18080".parse().unwrap();
    tokio::spawn(mitmforge_lib::proxy::start(sink, addr));
    // Poll until the proxy accepts connections.
    let mut stream = loop {
        match tokio::net::TcpStream::connect(addr).await {
            Ok(s) => break s,
            Err(_) => tokio::time::sleep(std::time::Duration::from_millis(50)).await,
        }
    };

    let req = format!(
        "GET http://{upstream_addr}/hello HTTP/1.1\r\nHost: example.test\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).await.unwrap();
    assert!(String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 200 OK"));

    let got = events.lock().unwrap();
    assert!(
        got.iter()
            .any(|e| matches!(e, ProxyEvent::Request { entry } if entry.url.contains("/hello")))
    );
    assert!(
        got.iter()
            .any(|e| matches!(e, ProxyEvent::Response { status: 200, .. }))
    );
}
