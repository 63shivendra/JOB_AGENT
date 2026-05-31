import unittest
from main import JobPost, local_mock_eval, aggregate_scores

class TestJobScoringEngine(unittest.TestCase):
    def test_verified_post(self):
        # Professional job post without flags
        post = JobPost(
            title="Senior Machine Learning Researcher",
            company="Google DeepMind",
            description="We are seeking a senior machine learning researcher to build deep learning and NLP architectures in Python and PyTorch. Candidates should possess a Ph.D. or 5+ years of equivalent research experience. Day-to-day includes writing research papers and scaling models on TPU infrastructure.",
            location="London, UK (Hybrid)",
            apply_url="https://careers.google.com/jobs/123",
            salary="£120,000 - £160,000",
            source_platform="linkedin"
        )
        
        evaluation = local_mock_eval(post)
        aggregated = aggregate_scores(evaluation)
        
        print(f"Verified Test Score: {aggregated['trust_score']} (Tier: {aggregated['tier']})")
        self.assertGreaterEqual(aggregated['trust_score'], 75)
        self.assertEqual(aggregated['tier'], 'verified')
        self.assertEqual(len(aggregated['flags']), 0)

    def test_scam_post_whatsapp_gmail(self):
        # Scam job post with typical indicators (WhatsApp contact, Gmail domain, daily earn)
        post = JobPost(
            title="Work From Home Assistant",
            company="Global Wealth Inc",
            description="URGENT Rockstars!!! Earn Rs 50,000 daily from home. No experience required, any college freshers can apply! Just copy-paste text and earn passive income. Contact HR immediately on WhatsApp +919999999999 or email us at globalhr@gmail.com. Unlimited income potential!",
            location="Remote",
            apply_url="https://bit.ly/scam-apply-link",
            salary="unlimited daily commission",
            source_platform="indeed"
        )
        
        evaluation = local_mock_eval(post)
        aggregated = aggregate_scores(evaluation)
        
        print(f"Scam Test Score: {aggregated['trust_score']} (Tier: {aggregated['tier']})")
        print(f"Flags detected: {aggregated['flags']}")
        
        self.assertLess(aggregated['trust_score'], 40)
        self.assertEqual(aggregated['tier'], 'fake')
        self.assertIn("Free email provider in contact: 'globalhr@gmail.com'", aggregated['flags'])
        self.assertIn("Requires application or contact via WhatsApp", aggregated['flags'])

    def test_suspicious_experience_mismatch(self):
        # Mismatch in seniority and experience requirements
        post = JobPost(
            title="Principal Architect",
            company="FastTech Startup",
            description="Looking for freshers with 0 experience to handle principal architect roles. Must know SQL, Python, Tableau, Docker, AWS, Kubernetes, Spark, Hadoop, Rust, and C++.",
            location="Mumbai, India",
            apply_url="https://naukri.com/job-listings/architect",
            salary="₹3L - ₹5L",
            source_platform="naukri"
        )
        
        evaluation = local_mock_eval(post)
        aggregated = aggregate_scores(evaluation)
        
        print(f"Suspicious Test Score: {aggregated['trust_score']} (Tier: {aggregated['tier']})")
        print(f"Flags detected: {aggregated['flags']}")
        
        self.assertTrue(40 <= aggregated['trust_score'] < 75)
        self.assertEqual(aggregated['tier'], 'suspicious')

    def test_local_mock_page_eval_job(self):
        from main import local_mock_page_eval
        raw_text = """
        Hiring for Machine Learning Researcher at Neural Systems Corp
        Location: Bengaluru, India (Hybrid)
        Salary: 18L - 24L
        We are seeking a Machine Learning Research Engineer to develop NLP transformer models.
        Must know Python, PyTorch, SQL, AWS, and Docker.
        Apply link is careers.neuralsystems.com.
        """
        url = "https://www.linkedin.com/jobs/view-985"
        res = local_mock_page_eval(url, raw_text)
        
        self.assertTrue(res["is_job"])
        self.assertEqual(res["extracted_job"]["title"], "Machine Learning Researcher")
        self.assertEqual(res["extracted_job"]["company"], "Neural Systems Corp")
        self.assertEqual(res["extracted_job"]["location"], "Bengaluru, India (Hybrid)")
        self.assertEqual(res["extracted_job"]["salary"], "18L - 24L")
        self.assertIn("language", res["checks"])

    def test_local_mock_page_eval_non_job(self):
        from main import local_mock_page_eval
        raw_text = """
        Buy shoes online at discount price. Best sports shoes in India.
        Free shipping across major cities. Contact support for checkout.
        """
        url = "https://www.shoestore.com/catalog"
        res = local_mock_page_eval(url, raw_text)
        
        self.assertFalse(res["is_job"])
        self.assertIn("reason", res)

if __name__ == "__main__":
    unittest.main()
