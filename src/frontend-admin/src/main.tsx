import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AdminAuthProvider>
      <App />
    </AdminAuthProvider>
  </React.StrictMode>,
);
