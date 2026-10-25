import { afterAll, beforeAll, beforeEach } from 'vitest';
import { ExtractionClient } from '../src/integrations/extraction.client.js';
import { StorageClient } from '../src/integrations/storage.client.js';
import { createTestApp, type TestApp } from './app.js';
import { FakeExtraction, MemoryStorage } from './doubles.js';
import { seedCatalog } from './fixtures.js';

type Agent = Awaited<ReturnType<TestApp['agent']>>;

/**
 * La app con almacenamiento e IA simulados y el catálogo de la spec 003, lista para las pruebas de
 * expedientes. Registra sus propios beforeAll/beforeEach/afterAll; úsala dentro de un `describe`.
 */
export function usePayablesApp() {
  const h = {
    t: undefined as unknown as TestApp,
    agent: undefined as unknown as Agent,
    storage: new MemoryStorage(),
    ai: new FakeExtraction(),
    /** Sube un PDF sintético. `label` hace distintos los bytes (y por tanto el UUID del modo fake). */
    upload: (name = 'factura.pdf', label = 'uno', fields: Record<string, string> = {}) => {
      let req = h.agent
        .post('/api/payables')
        .attach('file', Buffer.from(`%PDF-1.7 ${label}`), { filename: name });
      for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
      return req;
    },
    /** Sube y devuelve el expediente (201). */
    async created(name = 'factura.pdf', label = 'uno', fields: Record<string, string> = {}) {
      return (await h.upload(name, label, fields).expect(201)).body as PayableBody;
    },
  };

  beforeAll(async () => {
    h.t = await createTestApp((b) =>
      b
        .overrideProvider(StorageClient)
        .useValue(h.storage)
        .overrideProvider(ExtractionClient)
        .useValue(h.ai),
    );
  });
  afterAll(() => h.t.close());
  beforeEach(async () => {
    await h.t.reset();
    await seedCatalog(h.t.db);
    h.storage.files.clear();
    h.ai.calls = 0;
    h.ai.failNext = 0;
    h.ai.override = null;
    h.agent = await h.t.agent();
  });
  return h;
}

/** Lo que las pruebas leen de un PayableDto. */
export interface PayableBody {
  id: string;
  status: string;
  allowedActions: string[];
  reviewReasons: { code: string; field?: string }[];
  uncertainFields: string[];
  fields: Record<string, string | null>;
  purchaseOrder: { number: string } | null;
  schedule: {
    dueOn: string;
    suggestedPayOn: string;
    scheduledPayOn: string | null;
    urgent: boolean;
    overdue: boolean;
  } | null;
  payment: { paidOn: string; amount: string; reference: string } | null;
  documents: { invoice: string | null; complement: string | null } | null;
  discardReason: string | null;
}
