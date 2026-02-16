import type { z } from 'zod';

import type { eventSchema } from '../contracts/event.contract.js';

export type JuEvent = z.infer<typeof eventSchema>;
