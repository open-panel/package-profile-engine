import {
  ProfileDocumentSchema,
  ProfileSchema,
  type Profile,
  type ProfileDocument,
} from "@open-panel/shared";
import { z } from "zod";

export class ProfileValidationError extends Error {
  constructor(readonly issues: z.ZodIssue[]) {
    super(`Invalid profile: ${issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    this.name = "ProfileValidationError";
  }
}

/** Profiles are an untrusted boundary (imported files, hand-edited JSON) — always validate (specs.md Rule 5). */
export function validateProfile(input: unknown): Profile {
  const result = ProfileSchema.safeParse(input);
  if (!result.success) throw new ProfileValidationError(result.error.issues);
  return result.data;
}

export function validateProfileDocument(input: unknown): ProfileDocument {
  const result = ProfileDocumentSchema.safeParse(input);
  if (!result.success) throw new ProfileValidationError(result.error.issues);
  return result.data;
}
