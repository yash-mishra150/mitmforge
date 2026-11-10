//! Engine sanity: a plain-HTTP exchange through the proxy emits a Request
//! event (full URL) and a Response event (status, duration), correlated by
//! id, with bodies captured for lazy fetch.

use mitmforge_lib::proxy::{self, ProxyEvent, Sink};
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

    // Local upstream serves one hardcoded 200 with a JSON-ish body; no network.
    let upstream = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let upstream_addr = upstream.local_addr().unwrap();
    tokio::spawn(async move {
        if let Ok((mut s, _)) = upstream.accept().await {
            let mut buf = [0u8; 8192];
            let _ = s.read(&mut buf).await;
            let _ = s
                .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 13\r\nConnection: close\r\n\r\n{\"ok\": true}\n")
                .await;
        }
    });

    let addr: SocketAddr = "127.0.0.1:18080".parse().unwrap();
    let store = proxy::BodyStore::shared();
    tokio::spawn(proxy::start(
        sink,
        addr,
        None,
        store.clone(),
        std::future::pending(),
    ));
    // Poll until the proxy accepts connections.
    let mut stream = loop {
        match tokio::net::TcpStream::connect(addr).await {
            Ok(s) => break s,
            Err(_) => tokio::time::sleep(std::time::Duration::from_millis(50)).await,
        }
    };

    let req = format!(
        "GET http://{upstream_addr}/hello HTTP/1.1\r\nhost: example.test\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).await.unwrap();
    let mut buf = Vec::new();
    stream.read_to_end(&mut buf).await.unwrap();
    assert!(String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 200 OK"));

    let got = events.lock().unwrap();
    let request = got.iter().find_map(|e| match e {
        ProxyEvent::Request { entry } if entry.url.contains("/hello") => Some(entry.clone()),
        _ => None,
    });
    let request = request.expect("Request event for /hello");
    assert_eq!(request.scheme, "http");
    assert!(
        request.req_content_type.is_none(),
        "GET has no content-type"
    );
    assert!(request.req_size.is_none(), "GET has no content-length");
    let response = got
        .iter()
        .find_map(|e| match e {
            ProxyEvent::Response {
                id,
                status,
                duration_ms,
                res_content_type,
                res_size,
            } if *id == request.id => {
                Some((*status, *duration_ms, res_content_type.clone(), *res_size))
            }
            _ => None,
        })
        .expect("Response event matching the request id");
    assert_eq!(response.0, 200);
    assert!(response.1.is_some(), "duration is measured");
    assert!(response.2.is_none(), "upstream sends no content-type");
    assert_eq!(response.3, Some(13), "content-length 13");

    // Bodies are captured and fetched lazily, together with headers.
    let bodies = store
        .lock()
        .unwrap()
        .get(request.id)
        .expect("captured exchange");
    assert!(
        bodies
            .req_headers
            .as_deref()
            .unwrap_or("")
            .contains("host: example.test")
    );
    assert!(bodies.req_body.is_none(), "GET has no request body");
    assert!(
        bodies
            .res_headers
            .as_deref()
            .unwrap_or("")
            .contains("content-length: 13")
    );
    assert!(
        bodies
            .res_body
            .as_deref()
            .unwrap_or("")
            .contains("{\"ok\": true}")
    );
}
