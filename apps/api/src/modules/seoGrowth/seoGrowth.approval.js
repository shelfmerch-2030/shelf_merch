import { ApiError } from "../../utils/errors.js";
import { SeoContent, SeoKnowledge, SCOPE } from "./seoGrowth.models.js";
import { approvedBusinessKnowledge } from "./seoGrowth.knowledge.js";
import { articleHash, reviewEditedArticle } from "./seoGrowth.domain.js";

export async function assertSeoPublication(article) {
  if (!article.seoManaged) return;
  const content = await SeoContent.findOne({
    scope: SCOPE,
    articleId: article._id,
  });
  const hash = articleHash(article);
  if (
    !content ||
    !["approved", "published"].includes(content.status) ||
    !article.seoApprovedHash ||
    content.approvedHash !== hash ||
    article.seoApprovedHash !== hash
  ) {
    throw new ApiError(
      422,
      "This generated article needs approval for its current version in SEO management.",
      "SEO_APPROVAL_REQUIRED",
    );
  }
  const facts = await SeoKnowledge.find(approvedBusinessKnowledge()).lean();
  if (
    reviewEditedArticle(article, content, facts).some(
      (finding) => finding.severity === "error",
    )
  )
    throw new ApiError(
      422,
      "Supporting evidence or QA changed; review before publication.",
      "SEO_QA_BLOCKED",
    );
}
