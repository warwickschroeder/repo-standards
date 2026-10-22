# <The PR title: one line, sentence case, an imperative verb and the thing it acts on. Paste into the title field, not the body.>

> <Only when the branch is stacked: the PR it sits on, and "Review against that branch, not `<default>`.">

## What this adds

<One or two plain sentences: what the change is for.>

- **<A piece of the change, named in plain words.>** <At most a short clause, such as a limit a reader would assume away. One line.>
- **<The next piece.>** <Same shape: one line.>
- **<A shape repeated across backends or modules.>** <Say it once and list the sites; never a heading each.>
- **<A defect fixed in passing.>** <Deliberate, not collateral. Say so.>
- **<Deliberately unchanged.>** <The site that looks like it should have moved, and the reason it did not, so nobody finishes the job later.>
- **<A file changed for a reason its folder does not explain.>** <Why it is in this branch at all.>
- **Docs.** <Where they live and what links to them.>

## Tests

- `<TestProject/Folder>`: <what they prove, not what they are called, and which backends they run on.>
- `<NewTestProject>` (new): <what it covers, and why it had to be its own project.>
