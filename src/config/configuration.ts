export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  auth: {
    inboundToken: process.env.INBOUND_AUTH_TOKEN,
    jobStatusToken: process.env.JOB_STATUS_TOKEN,
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  worker: {
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2', 10),
  },

  tmpDir: process.env.TMP_DIR || '/tmp/gtdparser',

  idempotencyTtl: parseInt(process.env.IDEMPOTENCY_TTL || '15552000', 10),

  bitrix: {
    baseUrl: process.env.BITRIX_BASE_URL,
    webhookUrl: process.env.BITRIX_WEBHOOK_URL,
    dealStatusFieldCode: process.env.BITRIX_DEAL_STATUS_FIELD_CODE || 'UF_GTD_STATUS',
    resultFileFieldCode: process.env.BITRIX_RESULT_FILE_FIELD_CODE || 'UF_GTD_RESULT_FILE',
    commentFieldCode: process.env.BITRIX_COMMENT_FIELD_CODE || 'UF_GTD_COMMENT',
  },

  adobe: {
    clientId: process.env.ADOBE_CLIENT_ID,
    clientSecret: process.env.ADOBE_CLIENT_SECRET,
  },

  mappingFilePath: process.env.MAPPING_FILE_PATH || './config/mapping.json',

  requiredFields: (process.env.REQUIRED_FIELDS || '1,31,47').split(',').map((f) => f.trim()),
});

