export default function handler(req, res) {
  res.status(200).json({
    hasGithubToken: !!process.env.GITHUB_TOKEN,
  });
}
