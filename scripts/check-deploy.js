import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const token = process.env.GITHUB_TOKEN;

async function checkDeploy() {
  console.log('Querying GitHub API...');
  const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'node'
  };

  try {
    // Check repository details
    const repoRes = await fetch('https://api.github.com/repos/freewho99/opensoyce', { headers });
    if (!repoRes.ok) {
      console.error(`Failed to fetch repo: ${repoRes.status} ${repoRes.statusText}`);
      const text = await repoRes.text();
      console.error(text);
      return;
    }
    const repo = await repoRes.json();
    console.log(`Repo Name: ${repo.full_name}, Private: ${repo.private}`);

    // Check actions runs
    const runsRes = await fetch('https://api.github.com/repos/freewho99/opensoyce/actions/runs?per_page=3', { headers });
    if (runsRes.ok) {
      const runsData = await runsRes.json();
      console.log('\n--- Recent Action Runs ---');
      runsData.workflow_runs.forEach(run => {
        console.log(`- Run #${run.run_number}: ${run.name} (${run.status}, ${run.conclusion})`);
        console.log(`  Commit: ${run.head_commit.message}`);
        console.log(`  URL: ${run.html_url}`);
      });
    }

    // Check deployments
    const deployRes = await fetch('https://api.github.com/repos/freewho99/opensoyce/deployments?per_page=15', { headers });
    if (deployRes.ok) {
      const deployData = await deployRes.json();
      console.log('\n--- Recent Deployments ---');
      for (const dep of deployData) {
        console.log(`- Deployment ID: ${dep.id}, Ref: ${dep.ref}, Environment: ${dep.environment}`);
        // Fetch deployment status
        const statusRes = await fetch(dep.statuses_url, { headers });
        if (statusRes.ok) {
          const statuses = await statusRes.json();
          statuses.forEach(status => {
            console.log(`  Status: ${status.state} (${status.description}) - Target: ${status.target_url}`);
          });
        }
      }
    }

    // Check commit check-runs
    const commitRef = 'b391a01944bc306c59b20b22a012de9a7f34c2c5';
    console.log(`\n--- Check Runs for Commit ${commitRef} ---`);
    const checksRes = await fetch(`https://api.github.com/repos/freewho99/opensoyce/commits/${commitRef}/check-runs`, { headers });
    if (checksRes.ok) {
      const checksData = await checksRes.json();
      checksData.check_runs.forEach(run => {
        console.log(`- Check Run: ${run.name} (${run.status}, ${run.conclusion})`);
        console.log(`  Details URL: ${run.details_url}`);
        if (run.output) {
          console.log(`  Title: ${run.output.title}`);
          console.log(`  Summary: ${run.output.summary}`);
        }
      });
    }

    // Check commit statuses
    console.log(`\n--- Statuses for Commit ${commitRef} ---`);
    const statusListRes = await fetch(`https://api.github.com/repos/freewho99/opensoyce/statuses/${commitRef}`, { headers });
    if (statusListRes.ok) {
      const statuses = await statusListRes.json();
      statuses.forEach(status => {
        console.log(`- Status: ${status.context} (${status.state})`);
        console.log(`  Description: ${status.description}`);
        console.log(`  Target: ${status.target_url}`);
      });
    }
  } catch (error) {
    console.error('Error querying API:', error);
  }
}

checkDeploy();
