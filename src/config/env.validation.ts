import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().default('gemini-1.5-flash'),
  PG_HOST: Joi.string().default('localhost'),
  PG_PORT: Joi.number().default(5432),
  PG_USER: Joi.string().default('postgres'),
  PG_PASSWORD: Joi.string().default('postgres123'),
  PG_DATABASE: Joi.string().default('kg_explorer'),
});
