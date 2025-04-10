import ReactDOM from "react-dom/client";
import React from "react";  // Make sure React is imported
import App from "./App.tsx";
import "./index.css";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import { Home } from "./pages/Home.tsx";
import { Login } from "./pages/Login.tsx";

// Define the router with nested routes
const router = createBrowserRouter(
  [
    {
      path: "/ma-app", // Base path for the app
      element: <App />,
      children: [
        {
          path: "/ma-app",  // Home route
          element: <Home />,
        },
        {
          path: "/ma-app/login", // Login route
          element: <Login />,
        },
      ],
    },
  ],
  {
    // Use type assertion to bypass the TypeScript error
    future: {
      v7_startTransition: true, // Opt-in to the future React Router behavior
    } as any,
  }
);

// Render the React app with RouterProvider to handle routes
ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  // <React.StrictMode>
    <RouterProvider router={router} />
  // </React.StrictMode>
);
