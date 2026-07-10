import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element was not found.");

const rootRoute = createRootRoute();
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: App });
const router = createRouter({ routeTree: rootRoute.addChildren([indexRoute]) });
const queryClient = new QueryClient();

createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>
  </React.StrictMode>,
);
