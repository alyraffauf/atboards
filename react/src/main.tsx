import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { BreadcrumbProvider } from "./lib/breadcrumb";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BreadcrumbProvider>
      <RouterProvider router={router} />
    </BreadcrumbProvider>
  </StrictMode>,
);
