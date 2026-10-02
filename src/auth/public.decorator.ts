import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "backdash:isPublic";

// Marks a route (or controller) as reachable without a bearer token. The
// global AuthGuard treats everything else as protected.
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
