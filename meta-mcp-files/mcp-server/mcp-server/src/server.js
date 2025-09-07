// Meta Ads MCP Server powered by Pipedream Connect - FIXED VERSION
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

class MetaAdsMCPServer {
  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    // FIXED: Moved tools to be more accessible and simplified schema
    this.tools = [
      {
        name: 'meta_ads_get',
        description: 'Get Meta Ads campaign, ad set, or ad by ID',
        inputSchema: {
          type: 'object',
          properties: {
            resource_type: {
              type: 'string',
              enum: ['campaign', 'adset', 'ad'],
              description: 'Type of resource to get'
            },
            id: {
              type: 'string',
              description: 'ID of the resource'
            }
          },
          required: ['resource_type', 'id']
        }
      },
      {
        name: 'meta_ads_query',
        description: 'Query Meta Ads campaigns with filters',
        inputSchema: {
          type: 'object',
          properties: {
            resource_type: {
              type: 'string',
              enum: ['campaigns', 'adsets', 'ads'],
              description: 'Type of resources to query'
            },
            limit: {
              type: 'number',
              default: 25,
              description: 'Number of results to return'
            },
            status: {
              type: 'string',
              enum: ['ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'],
              description: 'Filter by status'
            }
          },
          required: ['resource_type']
        }
      },
      {
        name: 'meta_ads_report',
        description: 'Generate Meta Ads performance report with insights',
        inputSchema: {
          type: 'object',
          properties: {
            date_preset: {
              type: 'string',
              enum: ['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'last_30d'],
              default: 'last_30d',
              description: 'Time period for the report'
            },
            metrics: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['impressions', 'clicks', 'spend', 'ctr', 'cpc', 'cpm', 'reach', 'frequency']
              },
              default: ['impressions', 'clicks', 'spend', 'ctr', 'cpc'],
              description: 'Metrics to include in the report'
            },
            breakdown: {
              type: 'string',
              enum: ['campaign', 'adset', 'ad', 'age', 'gender', 'placement'],
              description: 'How to break down the data'
            }
          }
        }
      }
    ];
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    
    // FIXED: Add request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`, req.body);
      next();
    });
    
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        service: 'Meta Ads MCP Server',
        timestamp: new Date().toISOString(),
        tools: this.tools.length
      });
    });
  }

  setupRoutes() {
    this.app.post('/mcp', this.handleMCPRequest.bind(this));
    this.app.get('/auth/status/:userId', this.checkAuthStatus.bind(this));
    this.app.get('/test', (req, res) => {
      res.json({ 
        message: 'Meta Ads MCP Server is running!',
        toolsCount: this.tools.length,
        tools: this.tools.map(t => t.name)
      });
    });
    
    // FIXED: Add tools test endpoint
    this.app.get('/debug/tools', (req, res) => {
      res.json({
        toolsArray: this.tools,
        count: this.tools.length
      });
    });
  }

  async handleMCPRequest(req, res) {
    try {
      const { jsonrpc = '2.0', method, params, id } = req.body;
      const userId = req.headers['x-user-id'] || req.headers['authorization']?.replace('Bearer ', '');

      console.log(`🔌 MCP Request: ${method}`, { params, userId, id });

      // FIXED: Handle initialize properly
      if (method === 'initialize') {
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { 
                listChanged: true 
              }
            },
            serverInfo: {
              name: 'Meta Ads Business MCP Server',
              version: '1.0.0'
            }
          }
        };
        console.log('📤 Initialize response:', JSON.stringify(response, null, 2));
        return res.json(response);
      }

      // FIXED: Handle tools/list properly
      if (method === 'tools/list') {
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.tools  // This should be an array
          }
        };
        console.log('📤 Tools list response:', JSON.stringify(response, null, 2));
        return res.json(response);
      }

      // FIXED: Handle notifications/initialized (Claude sends this)
      if (method === 'notifications/initialized') {
        console.log('✅ Client initialized notification received');
        return res.status(200).end(); // No response needed for notifications
      }

      if (method === 'tools/call') {
        const { name, arguments: args } = params;
        console.log(`🔧 Tool call: ${name}`, args);
        
        // Skip auth check for now to test basic functionality
        // const isAuthenticated = await this.checkUserAuth(userId);
        // if (!isAuthenticated) {
        //   return res.json({
        //     jsonrpc: '2.0',
        //     id,
        //     result: {
        //       content: [{
        //         type: 'text',
        //         text: `🔐 Meta Ads authentication required!\n\n🔗 Connect your Meta Ads account: ${this.getAuthURL(userId)}\n\nAfter connecting, please try your request again.`
        //       }]
        //     }
        //   });
        // }

        const result = await this.executeTool(name, args, userId);
        
        const response = {
          jsonrpc: '2.0',
          id,
          result: {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }]
          }
        };
        
        console.log('📤 Tool call response:', JSON.stringify(response, null, 2));
        return res.json(response);
      }

      // Unknown method
      const errorResponse = {
        jsonrpc: '2.0',
        id,
        error: { 
          code: -32601, 
          message: `Method not found: ${method}` 
        }
      };
      console.log('❌ Unknown method response:', JSON.stringify(errorResponse, null, 2));
      return res.status(400).json(errorResponse);

    } catch (error) {
      console.error('💥 MCP Error:', error);
      const errorResponse = {
        jsonrpc: '2.0',
        id: req.body.id || null,
        error: { 
          code: -32603, 
          message: 'Internal error: ' + error.message 
        }
      };
      return res.status(500).json(errorResponse);
    }
  }

  async checkUserAuth(userId) {
    if (!userId) return false;
    
    try {
      const response = await fetch(
        `https://api.pipedream.com/v1/connect/accounts/${userId}/apps/facebook_marketing`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.PIPEDREAM_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return response.ok;
    } catch (error) {
      console.error('Auth check failed:', error);
      return false;
    }
  }

  getAuthURL(userId) {
    const baseURL = process.env.AUTH_BASE_URL || 'https://connect.businessmcp.com';
    return `${baseURL}/auth/connect?service=meta_ads&user=${userId}&return_to=claude`;
  }

  async executeTool(toolName, args, userId) {
    try {
      switch (toolName) {
        case 'meta_ads_get':
          return await this.getMetaAdsResource(args, userId);
        case 'meta_ads_query':
          return await this.queryMetaAds(args, userId);
        case 'meta_ads_report':
          return await this.generateMetaAdsReport(args, userId);
        default:
          throw new Error(`Unknown tool: ${toolName}`);
      }
    } catch (error) {
      return {
        error: true,
        message: error.message,
        timestamp: new Date().toISOString(),
        note: "This is a test response - Pipedream integration not fully configured"
      };
    }
  }

  async getMetaAdsResource(args, userId) {
    // FIXED: Return mock data for now to test tool functionality
    const { resource_type, id } = args;
    
    // Mock response for testing
    return {
      service: 'Meta Ads',
      operation: 'get',
      resource_type,
      id,
      data: {
        id: id,
        name: `Sample ${resource_type} ${id}`,
        status: 'ACTIVE',
        created_time: '2024-01-01T00:00:00+0000'
      },
      timestamp: new Date().toISOString(),
      note: "Mock data - replace with actual Pipedream call"
    };

    /* Actual Pipedream call (commented out for testing):
    const response = await fetch(
      `https://api.pipedream.com/v1/connect/accounts/${userId}/apps/facebook_marketing/actions/get_${resource_type}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PIPEDREAM_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get ${resource_type}: ${response.statusText}`);
    }

    const data = await response.json();
    
    return {
      service: 'Meta Ads',
      operation: 'get',
      resource_type,
      data,
      timestamp: new Date().toISOString()
    };
    */
  }

  async queryMetaAds(args, userId) {
    const { resource_type, limit = 25, status } = args;
    
    // Mock response for testing
    return {
      service: 'Meta Ads',
      operation: 'query',
      resource_type,
      filters: { limit, status },
      data: Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
        id: `${resource_type}_${i + 1}`,
        name: `Sample ${resource_type} ${i + 1}`,
        status: status || 'ACTIVE'
      })),
      timestamp: new Date().toISOString(),
      note: "Mock data - replace with actual Pipedream call"
    };
  }

  async generateMetaAdsReport(args, userId) {
    const { date_preset = 'last_30d', metrics = ['impressions', 'clicks', 'spend', 'ctr', 'cpc'], breakdown } = args;
    
    // Mock response for testing
    return {
      service: 'Meta Ads',
      operation: 'report',
      period: date_preset,
      metrics,
      breakdown,
      summary: {
        impressions: 125000,
        clicks: 3200,
        spend: 850.50,
        ctr: 2.56,
        cpc: 0.27
      },
      timestamp: new Date().toISOString(),
      note: "Mock data - replace with actual Pipedream call"
    };
  }

  calculateSummary(data, metrics) {
    if (!data || !data.length) return {};
    
    const summary = {};
    
    metrics.forEach(metric => {
      if (metric === 'ctr' || metric === 'cpc' || metric === 'cpm') {
        summary[metric] = data.reduce((sum, item) => sum + parseFloat(item[metric] || 0), 0) / data.length;
      } else {
        summary[metric] = data.reduce((sum, item) => sum + parseFloat(item[metric] || 0), 0);
      }
    });
    
    return summary;
  }

  async checkAuthStatus(req, res) {
    const { userId } = req.params;
    const isAuthenticated = await this.checkUserAuth(userId);
    
    res.json({
      userId,
      authenticated: isAuthenticated,
      service: 'Meta Ads',
      authUrl: isAuthenticated ? null : this.getAuthURL(userId)
    });
  }

  listen(port = 10000) {
    this.app.listen(port, () => {
      console.log(`🚀 Meta Ads MCP Server listening on port ${port}`);
      console.log(`🔌 MCP endpoint: POST /mcp`);
      console.log(`🏥 Health check: GET /health`);
      console.log(`🔧 Debug tools: GET /debug/tools`);
      console.log(`📊 Available tools: ${this.tools.map(t => t.name).join(', ')}`);
    });
  }
}

const server = new MetaAdsMCPServer();
server.listen(process.env.PORT || 10000);

export default MetaAdsMCPServer;
