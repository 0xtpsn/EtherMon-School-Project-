import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { useSession } from "@/context/SessionContext";

interface RecommendationsProps {
  selectedCategory?: string;
  selectedTab?: string;
}

/**
 * Recommendations component - placeholder for future NFT recommendations.
 * Legacy artwork recommendations have been deprecated in favor of NFT-based system.
 */
const Recommendations = ({ selectedCategory = "All", selectedTab = "all" }: RecommendationsProps) => {
  const { user } = useSession();

  // Currently returns null since legacy artwork recommendations are deprecated
  // TODO: Implement NFT recommendations based on user preferences and on-chain activity
  if (!user) {
    return null;
  }

  return null;
};

export default Recommendations;

