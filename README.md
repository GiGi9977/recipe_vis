# Recipe graph comparison

This repository implements the first working slice of `ARCHITECTURE_PLAN.md`: validated read-only recipe loading, tiered explainable matching, comparison graph construction, a FastAPI contract, and a React SVG explorer with source-step selection and deterministic collision repair.

The visual authority is `references/Beyond_Linear_Recipes_A_Visualization_for_Comparing_Procedural_Variants.pdf`. The renderer now implements its unified dual-dumbbell grammar: cyan shared nodes, periwinkle and lime recipe ownership, stacked similar states, physical-state rings, small auxiliary satellites, typed process edges, and triangular ADD endpoints. Ingredient initials currently stand in for the paper's icon set. Dense branch compaction, flavor-ring encoding, edge-node clearance, and label-corridor optimization are the next architecture phase.

## Run

```powershell
python -m pip install -r requirements.txt
python -m uvicorn backend.app:app --reload
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Run backend tests from the repository root with `python -m unittest discover -s tests -p "test_*.py"`. Run frontend checks with `npm test` and `npm run build`.
