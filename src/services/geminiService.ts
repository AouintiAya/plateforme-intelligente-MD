import { GoogleGenAI, Type } from "@google/genai";
import { 
  ProductData, 
  AnalysisAgentOutput, 
  SearchAgentOutput, 
  CreationAgentOutput, 
  ValidationAgentOutput,
  MarketingAgentOutput
} from "../types";
import { safeJsonParse, truncateObjectStrings } from "../lib/ai-utils";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// Helper: Extract initial data from raw input
export async function extractProductData(input: string | { data: string, mimeType: string }): Promise<ProductData> {
  const model = "gemini-3.1-flash-lite-preview";
  
  let contents: any;
  if (typeof input === 'string') {
    contents = `Vous êtes un expert en veille commerciale pour NET-INFO. Votre mission est d'extraire des données structurées à partir d'un texte brut (description de formation).
    
    Texte à analyser : "${input}"
    
    Instructions :
    1. Identifiez et extrayez les informations suivantes selon ces champs précis :
       - title : Titre de la formation
       - concept : Le concept global de la formation
       - target : Public cible (Pour qui)
       - why : Objectifs et motivation (Pourquoi)
       - includes : Ce que le concept inclut (contenu, modules)
       - supports : Supports de cours et outils fournis
       - format : Format de la formation. Choisissez OBLIGATOIREMENT parmi : 'bootcamp', 'formation certifiante', 'formation diplômante'. Analysez le contenu pour déterminer le format le plus probable.
       - duration : Durée de la formation (ex: 3 mois, 400 heures)
       - references : Références ou partenaires mentionnés
       - differentiation : Points de différenciation (Netinfo vs DALL ou autres)
       - ecosystem : Positionnement dans l'écosystème local/global
    2. Si une information est manquante, essayez de la déduire intelligemment du contexte ou laissez vide si impossible.
    3. Pour 'technologiesList', retournez une liste d'objets avec 'name' et 'level' (HIGH, MEDIUM, LOW) selon leur importance.
    4. Soyez précis, professionnel et objectif.
    
    Retournez UNIQUEMENT un objet JSON valide.`;
  } else {
    contents = {
      parts: [
        { inlineData: input },
        { text: "Vous êtes un expert en veille commerciale. Extrayez des données structurées de cette image/fichier de formation. Retournez un objet JSON avec : title, concept, target, why, includes, supports, format, duration, references, differentiation, ecosystem, technologiesList (objets avec name et level)." }
      ]
    };
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          concept: { type: Type.STRING },
          target: { type: Type.STRING },
          why: { type: Type.STRING },
          includes: { type: Type.STRING },
          supports: { type: Type.STRING },
          format: { 
            type: Type.STRING, 
            enum: ["bootcamp", "formation certifiante", "formation diplômante"] 
          },
          duration: { type: Type.STRING },
          references: { type: Type.STRING },
          differentiation: { type: Type.STRING },
          ecosystem: { type: Type.STRING },
          technologiesList: { 
            type: Type.ARRAY, 
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                level: { type: Type.STRING, enum: ["HIGH", "MEDIUM", "LOW"] }
              },
              required: ["name", "level"]
            }
          },
        },
        required: ["title", "concept", "target", "why", "includes", "supports", "format", "duration", "references", "differentiation", "ecosystem", "technologiesList"]
      }
    }
  });

  const parsed = safeJsonParse<any>(response.text, {});
  return {
    title: parsed.title || '',
    concept: parsed.concept || '',
    target: parsed.target || '',
    why: parsed.why || '',
    includes: parsed.includes || '',
    supports: parsed.supports || '',
    format: parsed.format || '',
    duration: parsed.duration || '',
    references: parsed.references || '',
    differentiation: parsed.differentiation || '',
    ecosystem: parsed.ecosystem || '',
    region: '', // Manual field
    certifications: '', // Manual field
    price: '', // Manual field
    technologiesList: parsed.technologiesList || []
  };
}

// Agent 1: Analysis Agent
export async function runAnalysisAgent(data: ProductData, freeText?: string): Promise<AnalysisAgentOutput> {
  const model = "gemini-3.1-flash-lite-preview";
  const prompt = `Vous êtes l'Agent d'Analyse. Votre objectif est d'analyser en profondeur la fiche produit et d'identifier les incohérences, les risques, les hypothèses et les zones d'incertitude.
  
  Données du produit : ${JSON.stringify(truncateObjectStrings(data))}
  Contexte utilisateur : ${freeText || "Aucun"}

  Responsabilités :
  - Analyser la cohérence de la fiche produit.
  - Évaluer la clarté de la proposition de valeur.
  - Identifier les faiblesses de positionnement.
  - Détecter les hypothèses non validées.
  - Identifier les points nécessitant une vérification du marché.
  - Attribuer un score d'efficacité (0-100) à chaque composant : title, concept, target, why, includes, supports, format, duration, references, differentiation, ecosystem.

  Contraintes :
  - NE PAS effectuer de recherches externes.
  - NE PAS créer de contenu marketing.
  - NE PAS valider le produit.
  - Distinguer les faits, les suppositions et les incertitudes.
  - RÉPONDRE EN FRANÇAIS.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          diagnostic: { type: Type.STRING },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          hypotheses: { type: Type.ARRAY, items: { type: Type.STRING } },
          risks: { type: Type.ARRAY, items: { type: Type.STRING } },
          questions: { type: Type.ARRAY, items: { type: Type.STRING } },
          efficiency: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.NUMBER },
              concept: { type: Type.NUMBER },
              target: { type: Type.NUMBER },
              why: { type: Type.NUMBER },
              includes: { type: Type.NUMBER },
              supports: { type: Type.NUMBER },
              format: { type: Type.NUMBER },
              duration: { type: Type.NUMBER },
              references: { type: Type.NUMBER },
              differentiation: { type: Type.NUMBER },
              ecosystem: { type: Type.NUMBER },
            },
            required: ["title", "concept", "target", "why", "includes", "supports", "format", "duration", "references", "differentiation", "ecosystem"]
          }
        },
        required: ["diagnostic", "strengths", "weaknesses", "hypotheses", "risks", "questions", "efficiency"]
      }
    }
  });

  return safeJsonParse<AnalysisAgentOutput>(response.text, {} as AnalysisAgentOutput);
}

// Agent 2: Search Agent
export async function runSearchAgent(analysis: AnalysisAgentOutput, data: ProductData): Promise<SearchAgentOutput> {
  const model = "gemini-3-flash-preview";
  const prompt = `Vous êtes l'Agent de Recherche. Votre objectif est de vérifier les hypothèses, les doutes et les risques identifiés par l'Agent d'Analyse dans l'environnement réel du marché.
  
  Résultat de l'Agent d'Analyse : ${JSON.stringify(truncateObjectStrings(analysis))}
  Données originales du produit : ${JSON.stringify(truncateObjectStrings(data))}

  Responsabilités :
  - Effectuer une veille concurrentielle à l'aide de Google Search.
  - Identifier les concurrents directs et indirects (nom, points forts, points faibles, gamme de prix).
  - IMPORTANT : EXCLURE "NET-INFO" (ou "Netinfo") de la liste des concurrents. Si Net-Info apparaît dans les résultats, considérez-le comme l'entité interne et ne l'incluez pas dans les benchmarks ou concurrents externes.
  - Analyser les tendances du marché.
  - Comparer les prix de formations similaires (toujours convertir ou exprimer les prix en TND - Dinar Tunisien).
  - Évaluer le niveau de compétitivité.
  - Identifier si la formation est tendance ou obsolète.
  - IMPORTANT : NE PAS proposer de recommandations de contenu marketing (vidéos, articles, etc.), cela est réservé à l'Agent de Veille Marketing.

  Contraintes :
  - Pour le champ "benchmarks", la propriété "source" DOIT être une URL valide et cliquable (commençant par http:// ou https://) vers la page spécifique de la formation ou la source.
  - NE PAS modifier la fiche produit.
  - NE PAS créer de contenu.
  - NE PAS prendre de décision finale.
  - RÉPONDRE EN FRANÇAIS.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          results: { type: Type.STRING },
          benchmarks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                price: { type: Type.STRING },
                source: { type: Type.STRING },
              }
            }
          },
          competitors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
                priceRange: { type: Type.STRING },
                url: { type: Type.STRING },
              },
              required: ["name", "strengths", "weaknesses", "priceRange"]
            }
          },
          competitiveness: { type: Type.STRING },
          trends: { type: Type.ARRAY, items: { type: Type.STRING } },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          threats: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["results", "benchmarks", "competitors", "competitiveness", "trends", "opportunities", "threats"]
      }
    }
  });

  const output = safeJsonParse<SearchAgentOutput>(response.text, {} as SearchAgentOutput);
  
  // Extract grounding chunks if available
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    output.groundingChunks = chunks.filter((c: any) => c.web).map((c: any) => ({
      web: {
        uri: c.web.uri,
        title: c.web.title
      }
    }));
  }

  return output;
}

// Agent 5: Marketing Agent
export async function runMarketingAgent(data: ProductData, search: SearchAgentOutput): Promise<MarketingAgentOutput> {
  const model = "gemini-3-flash-preview";
  const prompt = `Vous êtes l'Agent de Veille Marketing. Votre objectif est de centraliser l'activité sociale, l'innovation et les tendances pour la formation sélectionnée.
  
  Données de la formation : ${JSON.stringify(truncateObjectStrings(data))}
  Résultats de recherche marché : ${JSON.stringify(truncateObjectStrings(search))}

  Responsabilités :
  1. Monitoring des Réseaux Sociaux : Simulez une agrégation des dernières publications (LinkedIn, Facebook, Instagram) des leaders d'opinion du secteur. Limitez à 3 publications par plateforme.
  2. Analyse de Sentiment : Identifiez ce que les étudiants et professionnels disent des formations similaires (positif, neutre, négatif).
  3. Nouveautés & Tendances : Listez les dernières innovations pédagogiques ou technologiques liées à ce secteur.
  4. Recommandations de Contenu Marketing : Générez des idées de contenus (vidéos, Reels, articles, webinaires) pour promouvoir cette formation. C'est l'Agent de Veille Marketing qui a l'exclusivité sur ces recommandations.

  Contraintes :
  - Utilisez Google Search pour trouver des tendances réelles et des leaders d'opinion.
  - Soyez concis et stratégique. Évitez les répétitions.
  - Les noms de plateformes et d'auteurs doivent être courts (max 50 caractères).
  - RÉPONDRE EN FRANÇAIS.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          socialMonitoring: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                platform: { type: Type.STRING, description: "Nom court de la plateforme (ex: LinkedIn, Facebook)" },
                latestPosts: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      author: { type: Type.STRING },
                      content: { type: Type.STRING },
                      date: { type: Type.STRING },
                      engagement: { 
                        type: Type.OBJECT,
                        properties: {
                          likes: { type: Type.NUMBER },
                          shares: { type: Type.NUMBER },
                          comments: { type: Type.NUMBER }
                        },
                        required: ["likes", "shares", "comments"]
                      },
                      url: { type: Type.STRING },
                      sentimentScore: { type: Type.NUMBER, description: "Score de 0 à 100" }
                    },
                    required: ["author", "content", "date", "engagement", "url", "sentimentScore"]
                  }
                }
              },
              required: ["platform", "latestPosts"]
            }
          },
          sentimentAnalysis: {
            type: Type.OBJECT,
            properties: {
              overall: { type: Type.STRING, enum: ["POSITIVE", "NEUTRAL", "NEGATIVE"] },
              studentFeedback: { type: Type.ARRAY, items: { type: Type.STRING } },
              proFeedback: { type: Type.ARRAY, items: { type: Type.STRING } },
              score: { type: Type.NUMBER },
              justification: { type: Type.STRING }
            },
            required: ["overall", "studentFeedback", "proFeedback", "score", "justification"]
          },
          newsAndTrends: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                source: { type: Type.STRING },
                url: { type: Type.STRING },
                sentimentScore: { type: Type.NUMBER }
              },
              required: ["title", "description", "source", "url", "sentimentScore"]
            }
          },
          contentRecommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                format: { type: Type.STRING, enum: ["VIDEO", "POST", "ARTICLE", "WEBINAR"] },
                inspiredBySources: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "description", "format", "inspiredBySources"]
            }
          }
        },
        required: ["socialMonitoring", "sentimentAnalysis", "newsAndTrends", "contentRecommendations"]
      }
    }
  });

  return safeJsonParse<MarketingAgentOutput>(response.text, {} as MarketingAgentOutput);
}

// Agent 3: Creation Agent
export async function runCreationAgent(analysis: AnalysisAgentOutput, search: SearchAgentOutput): Promise<CreationAgentOutput> {
  const model = "gemini-3-flash-preview";
  const prompt = `Vous êtes l'Agent de Création. Votre objectif est de transformer les analyses et les recherches en solutions concrètes et exploitables pour le marché et le marketing.
  
  Résultat de l'Agent d'Analyse : ${JSON.stringify(truncateObjectStrings(analysis))}
  Résultat de l'Agent de Recherche : ${JSON.stringify(truncateObjectStrings(search))}

  Responsabilités :
  - Proposer une fiche produit corrigée et optimisée (incluant TOUS les champs : titre, description, programme, durée, prix, cible, technologies).
  - Ajuster le prix et le positionnement. IMPORTANT : Le prix DOIT TOUJOURS être exprimé en TND (Dinar Tunisien), jamais en $ ou €.
  - Définir des angles marketing.
  - Préparer des recommandations pour le Campaign Builder.

  Contraintes :
  - NE PAS valider le produit.
  - NE PAS prendre de décision commerciale finale.
  - RÉPONDRE EN FRANÇAIS.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          correctedFiche: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              programme: { type: Type.STRING },
              duration: { type: Type.STRING },
              price: { type: Type.STRING },
              target: { type: Type.STRING },
              technologies: { type: Type.STRING },
            }
          },
          marketingRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          contentConcepts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                description: { type: Type.STRING },
              }
            }
          },
          campaignAdvice: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["correctedFiche", "marketingRecommendations", "contentConcepts", "campaignAdvice"]
      }
    }
  });

  return safeJsonParse<CreationAgentOutput>(response.text, {} as CreationAgentOutput);
}

// Agent 4: Validation Agent
export async function runValidationAgent(data: ProductData, creation: CreationAgentOutput): Promise<ValidationAgentOutput> {
  const model = "gemini-3-flash-preview";
  const prompt = `Vous êtes l'Agent de Validation. Votre objectif est de valider ou de refuser définitivement la fiche produit ACTUELLE avant son lancement sur le marché.
  
  Fiche produit d'origine (à évaluer) : ${JSON.stringify(truncateObjectStrings(data))}
  Résultat de l'Agent de Création (pour contexte) : ${JSON.stringify(truncateObjectStrings(creation))}

  Responsabilités :
  - Vérifier la cohérence globale de la fiche d'origine.
  - Évaluer le niveau de risque final de la fiche d'origine.
  - Assurer l'alignement marché/business.
  - Prendre la décision finale (VALIDATED, UPDATE_REQUIRED, REFUSED) sur la fiche d'origine.

  Contraintes :
  - La décision doit porter sur la fiche d'origine, pas sur la fiche corrigée.
  - AUCUNE modification de contenu.
  - La décision est IRRÉVOCABLE pour ce cycle.
  - Autorité finale sur le processus.
  - RÉPONDRE EN FRANÇAIS.`;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          decision: { type: Type.STRING, enum: ["VALIDATED", "UPDATE_REQUIRED", "REFUSED"] },
          justification: { type: Type.STRING },
          finalFiche: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              programme: { type: Type.STRING },
              duration: { type: Type.STRING },
              price: { type: Type.STRING },
              target: { type: Type.STRING },
              technologies: { type: Type.STRING },
            }
          },
          validatedRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["decision", "justification", "finalFiche", "validatedRecommendations"]
      }
    }
  });

  return safeJsonParse<ValidationAgentOutput>(response.text, {} as ValidationAgentOutput);
}

// Agent 6: Intelligence Agent (Exploratory Mode)
export async function runIntelligenceAgent(
  query: string, 
  context?: string,
  file?: { data: string, mimeType: string }
): Promise<{ 
  analysis: string; 
  trends: string[]; 
  competitors: any[]; 
  opportunities: string[]; 
  recommendations: string[];
  groundingChunks?: any[];
}> {
  const model = "gemini-3-flash-preview";
  
  const parts: any[] = [];
  
  if (file) {
    parts.push({ inlineData: file });
  }

  const prompt = `Vous êtes l'Expert en Veille Stratégique de NET-INFO. Votre mission est de répondre à une question précise, une hypothèse ou une problématique marché de manière indépendante.
    
    Question/Problématique : "${query}"
    ${context ? `Contexte additionnel : "${context}"` : ""}
    ${file ? "Un document/image a été fourni en support. Analysez-le en priorité pour répondre à la question." : ""}

    IMPORTANT : Si l'utilisateur pose une QUESTION (ex: "Quelles sont...", "Comment...", "Pourquoi..."), vous devez vous CONCENTRER sur la réponse directe à cette question en utilisant des données concrètes et vérifiables. Ne vous contentez pas d'une analyse générique.

    Responsabilités :
    1. Analyser la problématique posée en utilisant Google Search pour obtenir des données fraîches et précises.
    2. Identifier les tendances actuelles liées à cette question.
    3. Repérer les acteurs clés ou concurrents pertinents sur ce sujet précis.
    4. Évaluer les opportunités et les menaces pour NET-INFO.
    5. Proposer des recommandations stratégiques concrètes et actionnables.

    Contraintes :
    - Utilisez Google Search pour des données réelles.
    - Soyez factuel, analytique et prospectif.
    - IMPORTANT : Le prix DOIT TOUJOURS être exprimé en TND (Dinar Tunisien).
    - RÉPONDRE EN FRANÇAIS.`;

  parts.push({ text: prompt });

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: "application/json",
      maxOutputTokens: 4096,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          analysis: { type: Type.STRING },
          trends: { type: Type.ARRAY, items: { type: Type.STRING } },
          competitors: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                description: { type: Type.STRING },
                relevance: { type: Type.STRING }
              }
            }
          },
          opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["analysis", "trends", "competitors", "opportunities", "recommendations"]
      }
    }
  });

  const output = safeJsonParse<any>(response.text, {});
  
  // Extract grounding chunks
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (chunks) {
    output.groundingChunks = chunks.filter((c: any) => c.web).map((c: any) => ({
      web: {
        uri: c.web.uri,
        title: c.web.title
      }
    }));
  }

  return output;
}
