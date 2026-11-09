import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./app/App";
import "./styles/index.css";
import "./styles/host.css";

createRoot(document.getElementById("root")!).render(<App />);

// The hosted preview can't reach Supabase, so it runs on a stand-in backend
// that saves to this browser. Say so once per visit.
if (import.meta.env.MODE === "preview") {
  setTimeout(() => {
    toast("Preview mode", {
      description: "Accounts, posts, votes and gold save in this browser only. Photos are placeholders.",
      duration: 8000,
    });
  }, 900);
}
