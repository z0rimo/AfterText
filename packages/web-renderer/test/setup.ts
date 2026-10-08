import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL's automatic afterEach cleanup only self-registers when it detects
// Jest-like globals; this project imports `afterEach` explicitly from
// "vitest" instead (no `test.globals` in vitest.config.ts), so cleanup is
// wired up here explicitly.
afterEach(cleanup);
