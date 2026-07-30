# Sunear v1 client

Use authenticated MCP discovery first when it is available. The bundled fallback client sends `Authorization: Bearer` on every request, including discovery.

```sh
node ../../scripts/sunear_agent_client.mjs capabilities
node ../../scripts/sunear_agent_client.mjs schema
node ../../scripts/sunear_agent_client.mjs examples
node ../../scripts/sunear_agent_client.mjs validate '<json facts>'
node ../../scripts/sunear_agent_client.mjs create '<json facts>'
node ../../scripts/sunear_agent_client.mjs read <projectId>
node ../../scripts/sunear_agent_client.mjs run <projectId> <runId>
node ../../scripts/sunear_agent_client.mjs revise <projectId> '<json revision>'
node ../../scripts/sunear_agent_client.mjs rotate <projectId>
node ../../scripts/sunear_agent_client.mjs open-review '<canonical reviewUrl>'
```

Do not infer or expose service-internal identities or routes. Treat project and run locators as opaque values returned by the public service. Error output is deliberately limited to HTTP status and `requestId`; use that request ID for private support without including project facts or secrets.

`create` and `rotate` may print a canonical Review Link after their redacted JSON result. That full URL is a secret. `open-review` prints only a supplied canonical Review Link so the user can open it; it does not authenticate or make a network request.
