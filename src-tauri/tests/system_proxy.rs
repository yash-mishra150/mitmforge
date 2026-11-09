//! Exercises the system-proxy toggle outside the app (no Tauri/WebView):
//! enable → registry reflects it → disable → restored. Run with a timeout;
//! a hang here means the bug is in `system_proxy` itself.

use mitmforge_lib::system_proxy;

#[test]
fn enable_disable_roundtrip() {
    let before = system_proxy::current();

    system_proxy::enable("127.0.0.1:8080").expect("enable");
    assert_eq!(system_proxy::current(), Some(true), "enabled");

    system_proxy::disable().expect("disable");
    assert_eq!(system_proxy::current(), Some(false), "disabled");

    // Restore whatever the machine had before the test.
    if before == Some(true) {
        system_proxy::enable("127.0.0.1:8080").expect("restore");
    }
}
