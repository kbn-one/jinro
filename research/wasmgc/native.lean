import Demo
def main : IO Unit := do
  for n in [0, 1, 10, 20, 25] do IO.println s!"fib {n} = {fib n}"
  for n in [0, 10, 1000, 10000] do IO.println s!"sumTo {n} = {sumTo n}"
  for n in [1, 10, 1000, 5000] do IO.println s!"treeSize {n} = {treeSize n}"
