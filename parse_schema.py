import json

with open('schema.json', 'r') as f:
    data = json.load(f)

definitions = data.get('definitions', {})
for table_name, table_def in definitions.items():
    print(f"Table: {table_name}")
    properties = table_def.get('properties', {})
    for col_name, col_def in properties.items():
        col_type = col_def.get('type', col_def.get('format', 'unknown'))
        description = col_def.get('description', '')
        print(f"  - {col_name} ({col_type}): {description}")
    print()
