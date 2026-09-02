# <A claim, not a label. What is true after this branch.>

<Two or three sentences of plain language. What class of problem existed, what the change does about it, and what stays the same in production. This is the only prose in the document.>

## What is wrong today

- **<The defect, stated as a claim.>** <The evidence: the file, the mechanism, and what it costs someone.>
- **<The second one.>** <Same shape.>
- **<A defect that repeats across backends or modules.>** <Say it once, list the sites, do not give each one its own heading.>

## What it looks like afterwards

- <The headline change, one line.>
- <The consequence a reviewer cares about, in terms they already understand.>
- **<A grouped area, for example a backend or a subsystem.>** <Every site in it, semicolon-separated, one bullet.>
- **<A second grouped area.>** <Same shape.>
- **<A defect fixed in passing.>** <Deliberate, not collateral. Say so.>
- **<Deliberately unchanged.>** <The site that looks like it should have been changed, and the reason it was not, so nobody finishes the job later.>

## Test coverage

- **<What the test proves, not what it is called.>** <How many, what they assert, which backends they run on.>
- **<The test that would have caught the defect above.>** <Name the connection explicitly; it is the strongest thing in the document.>
- **<A test-infrastructure change that looks arbitrary.>** <The reason, or it reads as a fudge.>
