import type { z } from 'zod';

import type { cliErrorSchema } from '../contracts/cli-error.contract.js';

export type CliErrorPayload = z.infer<typeof cliErrorSchema>;
