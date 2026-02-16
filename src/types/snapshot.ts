import type { z } from 'zod';

import type { snapshotSchema } from '../contracts/snapshot.contract.js';

export type OfficeSnapshot = z.infer<typeof snapshotSchema>;
