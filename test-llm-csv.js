const fs = require('fs');
const { Client } = require('pg');

function parseCsv(content) {
  const lines = [];
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (inQuotes && content[i + 1] === '"') {
        currentLine += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === '\n' || char === '\r') {
      if (inQuotes) {
        currentLine += char;
      } else {
        if (currentLine.trim()) {
          lines.push(currentLine);
        }
        currentLine = '';
      }
    } else {
      currentLine += char;
    }
  }
  if (currentLine.trim()) {
    lines.push(currentLine);
  }

  if (lines.length === 0) return [];
  
  const headers = splitCsvLine(lines[0]);
  const results = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    results.push(obj);
  }
  
  return results;
}

function splitCsvLine(line) {
  const result = [];
  let currentVal = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(currentVal);
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  result.push(currentVal);
  return result;
}

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
  
  const csvContent = fs.readFileSync('../dataset/llms.csv', 'utf8');
  const records = parseCsv(csvContent);
  console.log(`Parsed ${records.length} records.`);

  for (const r of records) {
    const { 
      id, name, category, license, version, description, color, 
      language, ecosystem, provider
    } = r;
    const data_model = r.data_model || r.dataModel;
    const supports_vector_native = r.supports_vector_native || r.supportsVectorNative;
    const context_window = r.context_window || r.contextWindow;
    const is_multimodal = r.is_multimodal || r.isMultimodal;
    const cost_per_1k_input_tokens = r.cost_per_1k_input_tokens || r.costPer1kInputTokens;
    const cost_per_1k_output_tokens = r.cost_per_1k_output_tokens || r.costPer1kOutputTokens;
    const service_type = r.service_type || r.serviceType;

    if (!id || !name || !category) continue;

    let mappedCategory = category.toUpperCase();

    const supportsVec = supports_vector_native === 'true' || supports_vector_native === '1';
    const isMulti = is_multimodal === 'true' || is_multimodal === '1';
    const cWindow = context_window ? parseInt(context_window, 10) : null;
    const cInput = cost_per_1k_input_tokens ? parseFloat(cost_per_1k_input_tokens) : null;
    const cOutput = cost_per_1k_output_tokens ? parseFloat(cost_per_1k_output_tokens) : null;

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
      await client.query(query, [
        id, name, mappedCategory, license || null, version || null, description || null, color || null,
        language || null, ecosystem || null, data_model || null, supportsVec, provider || null,
        cWindow, isMulti, cInput, cOutput, service_type || null
      ]);
      console.log(`Inserted ${id} successfully.`);
    } catch (err) {
      console.error(`Error inserting ${id}:`, err.message);
    }
  }
  
  await client.end();
}

test();
