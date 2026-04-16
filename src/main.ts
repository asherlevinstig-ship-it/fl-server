import { listen } from "@colyseus/tools";
import server from "./app.config";

// The tools package automatically handles process.env.PORT and console logging
listen(server);