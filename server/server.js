import "@babel/polyfill";
import dotenv from "dotenv";
import "isomorphic-fetch";
import createShopifyAuth, { verifyRequest } from "@shopify/koa-shopify-auth";
import graphQLProxy, { ApiVersion } from "@shopify/koa-shopify-graphql-proxy";
import Koa from "koa";
import next from "next";
import Router from "koa-router";
import session from "koa-session";

dotenv.config();
const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SCOPES, IS_LAMBDA } = process.env;

function createServer() {
  const koaServer = new Koa();
  const router = new Router();
  koaServer.proxy = true;
  koaServer.use(session({ secure: true, sameSite: "none" }, koaServer));
  koaServer.keys = [SHOPIFY_API_SECRET];
  koaServer.use(
    createShopifyAuth({
      apiKey: SHOPIFY_API_KEY,
      secret: SHOPIFY_API_SECRET,
      scopes: [SCOPES],
      afterAuth(ctx) {
        const { shop, accessToken } = ctx.session;
        ctx.cookies.set("shopOrigin", shop, {
          httpOnly: false,
          secure: true,
          sameSite: "none",
        });
        ctx.redirect("/");
      },
    })
  );

  koaServer.use(graphQLProxy({ version: ApiVersion.April20 }));
  router.get("(.*)", verifyRequest(), async (ctx) => {
    await handle(ctx.req, ctx.res);
    ctx.respond = false;
    ctx.res.statusCode = 200;
  });
  koaServer.use(router.allowedMethods());
  koaServer.use(router.routes());

  return koaServer;
}

if (!IS_LAMBDA) {
  app.prepare().then(() => {
    const server = createServer();
    server.listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
    });
  });
}

exports.handler = (event, context) => {
  if (IS_LAMBDA) {
    const server = createServer();
    awsServerlessExpress.proxy(
      awsServerlessExpress.createServer(server.callback()),
      event,
      context
    );
  } else {
    app.prepare().then(() => {
      const server = createServer();
      server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
      });
    });
  }
};
