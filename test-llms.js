const { Client } = require('pg');

async function test() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres123',
    database: 'kg_explorer',
  });
  
  await client.connect();
  console.log("Connected to test database.");
  
  const query = `
    INSERT INTO technologies (
      id, name, category, license, version, description, color,
      language, ecosystem, data_model, supports_vector_native, provider,
      context_window, is_multimodal, cost_per_1k_input_tokens, cost_per_1k_output_tokens, service_type
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        category = EXCLUDED.category,
        license = EXCLUDED.license,
        version = EXCLUDED.version,
        description = EXCLUDED.description,
        color = EXCLUDED.color,
        language = EXCLUDED.language,
        ecosystem = EXCLUDED.ecosystem,
        data_model = EXCLUDED.data_model,
        supports_vector_native = EXCLUDED.supports_vector_native,
        provider = EXCLUDED.provider,
        context_window = EXCLUDED.context_window,
        is_multimodal = EXCLUDED.is_multimodal,
        cost_per_1k_input_tokens = EXCLUDED.cost_per_1k_input_tokens,
        cost_per_1k_output_tokens = EXCLUDED.cost_per_1k_output_tokens,
        service_type = EXCLUDED.service_type;
  `;
  
  try {
    // llm-gemini-15-pro
    await client.query(query, [
      'llm-gemini-15-pro', 'Google Gemini 1.5 Pro', 'LLM', 'PROPRIETARY', '1.5-pro', 'Highly capable multimodal model supporting 1M token context window.', '#4285F4',
      null, null, null, false, 'Google', 1000000, true, 0.00125, 0.00375, null
    ]);
    console.log("Inserted gemini-1.5-pro successfully!");
  } catch (err) {
    console.error("Error inserting gemini-1.5-pro:", err.message);
  }
  
  await client.end();
}

test();
