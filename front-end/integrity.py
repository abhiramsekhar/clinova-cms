import re

with open('frontend/data/seed.js', 'r', encoding='utf-8') as f:
    code = f.read()

# We need to simulate the generation logic
completed_appts_indices = [
    i for i, m in enumerate(re.finditer(r"status:\s*['\"]COMPLETED['\"]", code))
]
# Wait, this regex is too broad if there are other status: 'COMPLETED' (like labOrders).
# Let's extract the appointments block.
appts_block = re.search(r"const apptData = \[(.*?)\];", code, re.DOTALL).group(1)
appts_lines = [l for l in appts_block.split('\n') if l.strip() and not l.strip().startswith('//')]

generated_consults = set()
for i, line in enumerate(appts_lines):
    if "'COMPLETED'" in line:
        generated_consults.add(f"consult-{str(i+1).zfill(3)}")

rx_cids = set(re.findall(r"cId:\s*['\"](consult-\d+)['\"]", code))

missing_in_generated = rx_cids - generated_consults
if missing_in_generated:
    print("These consultations are referenced by rxData but were not generated:", missing_in_generated)
else:
    print("All consultations referenced by rxData are properly generated!")
