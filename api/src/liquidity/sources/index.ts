/**
 * Standard source set wired to the live network. A router source is only
 * included when the chain has PAYRAIL_ROUTER_ADDRESS_<CHAIN> configured.
 */

import type { Net } from "../../net.js";
import { buildRouterSource, type RouterDep } from "./payrailRouter.js";
import { routerSourceName } from "./payrailRouter.js";

export function defaultSources(net: Net) {
  const routerDep: RouterDep = {
    async getReserves(chain, router) {
      return net.getRouterReserves(chain, router);
    },
  };
  return [buildRouterSource(routerDep)];
}

export { routerSourceName };
export * from "./payrailRouter.js";