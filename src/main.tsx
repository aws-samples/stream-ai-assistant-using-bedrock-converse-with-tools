import { Amplify } from "aws-amplify";
import React from "react";
import ReactDOM from "react-dom/client";
import outputs from "../amplify_outputs.json";
import { App } from "./App";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";

Amplify.configure(outputs);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
