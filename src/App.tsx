import { useEffect } from "react";
import "./App.css";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { commands, type ProxyEvent } from "./bindings";
import { useTraffic } from "./features/traffic/store";
import { TrafficGrid } from "./features/traffic/TrafficGrid";

// Single backend → UI event channel; payload is a tagged ProxyEvent.
const PROXY_EVENT = "proxy://event";

export default function App() {
  useEffect(() => {
    const unlisten = getCurrentWebviewWindow().listen<ProxyEvent>(PROXY_EVENT, ({ payload }) => {
      if (payload.type === "request") {
        useTraffic.getState().addRequest(payload.entry);
      } else {
        useTraffic.getState().addResponse(payload.id, payload.status);
      }
    });
    // Start the proxy only after the listener is attached, so no traffic is lost.
    void commands.proxyStart();
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return <TrafficGrid />;
}
