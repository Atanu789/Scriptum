export const SECTION_TEMPLATE = `## Problem Statement

## Input Format

## Output Format

## Constraints

## Sample Input

## Sample Output

## Explanation
`;

export const TAG_OPTIONS = [
  'DP',
  'Graph',
  'Math',
  'Greedy',
  'Binary Search',
  'Strings',
  'Trees',
  'Bitmask',
  'Implementation',
];

export const FONT_FAMILIES = [
  'Inter',
  'Georgia',
  'Merriweather',
  'JetBrains Mono',
  'Source Code Pro',
];

export const FONT_SIZES = ['12px', '14px', '16px', '18px', '22px', '28px'];

export const STARTER_HTML = `
<h2>Problem Statement</h2>
<p>You are given an integer array of length <strong>n</strong>. Find the minimum operations required to make all elements equal.</p>
<h2>Input Format</h2>
<ul>
  <li>The first line contains an integer <code>n</code>.</li>
  <li>The second line contains <code>n</code> space-separated integers.</li>
</ul>
<h2>Output Format</h2>
<p>Print the minimum number of operations.</p>
<h2>Constraints</h2>
<p>$1 \leq n \leq 2 \times 10^5$</p>
<pre><code class="language-cpp">#include &lt;bits/stdc++.h&gt;
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);
  return 0;
}
</code></pre>
`;
