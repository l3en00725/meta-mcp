import express, { Request, Response } from "express";
import dotenv from "dotenv";
import axios from "axios";
import cors from "cors";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.use(cors());

// Simple in-memory store (replace w/ DB for production)
type Tokens = {
  accessToken: string;
  expiresAt?: number;
};
const tokensByUser = new Map<string, Tokens>();

// ---------------- Health ----------------
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "Meta Ads MCP" });
});

// ---------------- OAuth ----------------
app.get("/auth/meta", (req: Request, res: Response) => {
  const userId = String(req.query.userId || "default");
  const params = new URLSearchParams({
    client_id: process.env.META_CLIENT_ID!,
    redirect_uri: process.env.META_REDIRECT_URI!,
    state: userId,
    response_type: "code",
    scope: process.env.META_SCOPES!,
  });
  res.redirect(`https://www.facebook.com/v21.0/dialog/oauth?${params.toString()}`);
});

app.get("/auth/meta/callback", async (req: Request, res: Response) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "default");

    const { data } = await axios.get("https://graph.facebook.com/v21.0/oauth/access_token", {
      params: {
        client_id: process.env.META_CLIENT_ID!,
        client_secret: process.env.META_CLIENT_SECRET!,
        redirect_uri: process.env.META_REDIRECT_URI!,
        code,
      },
    });

    tokensByUser.set(state, {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    });

    res.send(`<h1>✅ Meta Ads Connected!</h1>
              <p>User: ${state}</p>
              <p>Token saved, you can now use Claude tools.</p>`);
  } catch (err: any) {
    res.status(500).json({ error: "OAuth exchange failed", details: err?.message });
  }
});

// ---------------- MCP ----------------
const tools = [
  {
    name: "meta_ads_get",
    description: "Get campaign/adset/ad by ID",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: { type: "string", enum: ["campaign", "adset", "ad"] },
        id: { type: "string" },
      },
      required: ["resource_type", "id"],
    },
  },
  {
    name: "meta_ads_query",
    description: "Query campaigns/adsets/ads",
    inputSchema: {
      type: "object",
      properties: {
        resource_type: { type: "string", enum: ["campaigns", "adsets", "ads"] },
        limit: { type: "number" },
      },
      required: ["resource_type"],
    },
  },
];

app.post("/mcp", async (req: Request, res: Response) => {
  const { method, id, params } = req.body;

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "Meta Ads MCP", version: "1.0.0" },
      },
    });
  }

  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools } });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params;
    const userId = "default"; // later support multiple
    const token = tokensByUser.get(userId);

    if (!token) {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            { type: "text", text: `🔐 Authenticate here: ${process.env.META_REDIRECT_URI}?userId=${userId}` },
          ],
        },
      });
    }

    if (name === "meta_ads_get") {
      const url = `https://graph.facebook.com/v21.0/${args.id}`;
      const { data } = await axios.get(url, {
        params: { fields: "id,name,status", access_token: token.accessToken },
      });
      return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
    }

    if (name === "meta_ads_query") {
      const url = `https://graph.facebook.com/v21.0/me/${args.resource_type}`;
      const { data } = await axios.get(url, {
        params: { limit: args.limit || 10, access_token: token.accessToken },
      });
      return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
    }
  }

  res.status(400).json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});

app.listen(PORT, () => {
  console.log(`🚀 Meta MCP running on ${PORT}`);
});

