import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { queryClient } from "./lib/queryClient";
import { persistOptions } from "./lib/queryPersister";
import { router } from "./router/routes";
import { BreadcrumbProvider } from "./hooks/useBreadcrumb";
import "./index.css";

window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
    >
      <BreadcrumbProvider>
        <RouterProvider router={router} />
      </BreadcrumbProvider>
      {import.meta.env.DEV && (
        <ReactQueryDevtools buttonPosition="bottom-left" />
      )}
    </PersistQueryClientProvider>
  </StrictMode>,
);
