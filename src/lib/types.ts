import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
export type Metadata = FunctionReturnType<typeof api.workspace.metadata>;
