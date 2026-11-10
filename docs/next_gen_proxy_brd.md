# Business Requirements Document (BRD) & Development Guide
**Project Name:** OpenProxy (Placeholder Name)
**Category:** Native HTTP/HTTPS Debugging Proxy & Network Monitor
**Core Philosophy:** 100% Free, Zero-Subscription, BYOK AI-Native, Uncapped Performance.

---

## 1. Executive Summary
### 1.1 The Problem
Developers, QA engineers, and security researchers rely heavily on HTTP debugging proxies to intercept and modify network traffic. Currently, the market is monopolized by proprietary SaaS tools (Proxyman, Requestly) that lock essential features (Breakpoints, Local Mapping) behind expensive paywalls ($89+ licenses or $20/mo subscriptions). Existing open-source alternatives are either CLI-only (mitmproxy), plagued by Java memory bloat (Charles/ZAP), or hindered by Electron's JavaScript serialization bottlenecks (HTTP Toolkit).

### 1.2 The Solution
A blazing-fast, cross-platform, native desktop application built with **Tauri v2** and **Rust**. By leveraging Rust's `tokio` runtime for bare-metal network interception and Tauri's IPC for direct binary data streaming, we will build a proxy that uses a fraction of the RAM of its competitors. It will offer unlimited traffic manipulation rules for free and integrate a native OpenRouter AI engine for intelligent network debugging.

---

## 2. Technology Stack
### 2.1 Backend (Rust)
*   **Core Engine:** `tokio` (asynchronous runtime), `hyper` (HTTP implementation).
*   **Interception & Certificates:** `hudsucker` or `slinger-mitm` (Man-in-the-Middle proxying and dynamic SSL/TLS certificate generation).
*   **System Configuration:** Custom Rust modules to interact with macOS/Windows network settings to automatically set `127.0.0.1` as the system proxy and install the Root CA.
*   **IPC (Inter-Process Communication):** Tauri v2 IPC utilizing `ArrayBuffer` to stream raw bytes directly to the frontend, bypassing JSON serialization overhead.

### 2.2 Frontend (Tauri + React)
*   **Framework:** React 18+ (TypeScript), Vite.
*   **Styling:** Tailwind CSS (designed with a native-feeling, high-contrast dark mode by default).
*   **Data Virtualization:** `TanStack Virtual` or `AG Grid` (critical for scrolling through 50,000+ intercepted requests at 60FPS without DOM lag).
*   **Code/Syntax Highlighting:** `Monaco Editor` or `CodeMirror` for editing JSON, Headers, and GraphQL payloads.

---

## 3. Core Architecture & Data Flow
1.  **Startup:** Rust backend binds to a local port (e.g., `8080`), generates a Root CA, and configures the OS to route all HTTP/HTTPS traffic through this port.
2.  **Interception:** `hudsucker` decrypts incoming HTTPS traffic using the dynamically signed certificates.
3.  **Processing:** Rust parses the raw HTTP streams. It evaluates active rules (Breakpoints, Map Local).
4.  **Streaming:** Rust sends lightweight metadata (Method, URL, Status, Time) via Tauri events to the React grid.
5.  **Lazy Loading:** When a user clicks a request in the grid, the React UI requests the heavy payload (Body) from Rust, which delivers it via direct binary IPC for rendering.

---

## 4. Feature Specifications

### 4.1 The Workspace UI (3-Pane Layout)
*   **Left Sidebar (Filters):** Filter traffic by Source App, Domain, Status Code, and Pinned/Favorites.
*   **Top-Right (Live Traffic Grid):** A virtualized data table displaying ID, Method, Status, URL, Client, Time, and Duration. Must support complex filtering and sorting.
*   **Bottom-Right (Inspector):** A tabbed interface displaying Request and Response details.
    *   *Tabs:* Headers, Query, Body, Raw.
    *   *Body Previewers:* Auto-formatting for JSON, Form URL-Encoded, HTML, XML, WebViews, Protobuf, MessagePack, JWT, and raw Hex.

### 4.2 Traffic Manipulation (The "Unlimited" Advantage)
Unlike competitors, these features will have **no limits**.
*   **Map Local:** Intercept an API request and serve a local JSON, text, or image file directly from the disk. Support overriding HTTP status codes and headers.
*   **Map Remote:** Silently redirect traffic from one host/path to another (e.g., mapping a production API URL to `localhost:3000`). Support regex and wildcard matching.
*   **Active Breakpoints:** Pause an outgoing request or incoming response mid-flight. Present a modal UI allowing the user to modify the payload, headers, or URL before clicking "Execute" to release it.
*   **GraphQL Parsing:** Natively parse GraphQL payloads to extract `OperationName` and `Query`, allowing users to map or breakpoint specific GraphQL mutations instead of treating them all as generic `/graphql` POST requests.

### 4.3 The "Compose" Tool
*   A built-in HTTP client tab (similar to Postman).
*   Allows users to drag a captured request from the grid, edit its parameters, and replay it directly from the proxy to test endpoints instantly.

### 4.4 AI Integration (OpenRouter BYOK)
Deeply integrated, zero-subscription AI features utilizing the user's OpenRouter API key.
*   **Context-Menu Actions:** Right-click any request in the grid to trigger:
    *   *Explain Error:* Analyzes 4xx/5xx responses and stack traces.
    *   *Generate Mock:* Reads request headers/parameters and writes a realistic JSON response, instantly saving it as a Map Local rule.
    *   *Code Generation:* Converts the request into `reqwest` (Rust), `fetch` (JS), or `curl` commands.
*   **Prompt-Driven Scripting:** Instead of writing complex JavaScript to rewrite payloads (like in Proxyman), users can provide a natural language prompt (e.g., "Mask all email addresses in this JSON") and the local AI agent dynamically transforms the payload.

---

## 5. Implementation Phases

### Phase 1: MVP (The Core Engine)
*   Initialize Tauri v2 + React workspace.
*   Implement the Rust `tokio` MITM server (`hudsucker`).
*   Build the manual Certificate export/install flow.
*   Build the React Virtualized Grid to display raw traffic metadata.
*   Implement the Inspector panel with a basic JSON and Text previewer.

### Phase 2: Traffic Manipulation & Polish
*   Implement Breakpoints (pausing the Rust async thread until UI confirmation).
*   Implement Map Local and Map Remote rule engines.
*   Build the advanced body previewers (Hex, Form Data, Protobuf).
*   Implement OS-level auto-proxy configuration (macOS/Windows).

### Phase 3: AI & Advanced Tools
*   Integrate OpenRouter API client in Rust.
*   Build the Context Menu AI hooks (Explain, Mock, Generate Code).
*   Implement the internal "Compose" HTTP client.
*   Add GraphQL specific filtering and analytics charts.