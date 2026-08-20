import type { UnmaskedVendor, UnmaskingReport } from './types.js';

interface ProcessorPattern {
  processor: string;
  patterns: RegExp[];
  extractionRules: {
    method: 'delimiter' | 'position' | 'regex' | 'lookup';
    delimiter?: string;
    position?: number;
    regex?: RegExp;
    cleanupPatterns?: RegExp[];
  };
  confidence: number;
}

export class VendorUnmasker {
  private processorPatterns: ProcessorPattern[] = [
    {
      processor: 'PayPal',
      patterns: [/^PAYPAL\s*\*/i, /^PP\*/i, /^PAYPAL\s+/i, /\bPAYPAL\b.*\*/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^PAYPAL\s*\*/i, /^\d+\s*/],
      },
      confidence: 0.9,
    },
    {
      processor: 'Square',
      patterns: [/^SQ\s*\*/i, /^SQUARE\s*\*/i, /^SQU\*/i, /\bSQUARE\b.*\*/i, /^GOSQ\.COM/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^SQ\w*\s*\*/i, /^\d+\s*/],
      },
      confidence: 0.9,
    },
    {
      processor: 'Stripe',
      patterns: [/^STRIPE/i, /^STR\*/i, /\bSTRIPE\.COM\b/i, /STRIPE\s+CHARGE/i],
      extractionRules: {
        method: 'regex',
        regex: /(?:STR\*|STRIPE[:\s]+)(.+?)(?:\s+\d{10,})?$/i,
        cleanupPatterns: [/\s+CHARGE$/i],
      },
      confidence: 0.85,
    },
    {
      processor: 'Venmo',
      patterns: [/^VENMO\s+/i, /^VENMO\s*\*/i, /\bVENMO\b.*PAYMENT/i],
      extractionRules: {
        method: 'position',
        position: 1,
        cleanupPatterns: [/^VENMO\s+/i, /\s+PAYMENT$/i],
      },
      confidence: 0.8,
    },
    {
      processor: 'CashApp',
      patterns: [/^CASH\s*APP/i, /^CASH-APP/i, /^CA\*/i, /\bCASHAPP\b/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^CA\w*\s*\*/i],
      },
      confidence: 0.85,
    },
    {
      processor: 'Zelle',
      patterns: [/^ZELLE\s+/i, /\bZELLE\b.*PAYMENT/i, /^ZELLE\s*TO\s+/i],
      extractionRules: {
        method: 'regex',
        regex: /ZELLE\s+(?:TO\s+)?(.+?)(?:\s+\d{10,})?$/i,
      },
      confidence: 0.8,
    },
    {
      processor: 'Toast',
      patterns: [/^TST\*/i, /^TOAST\s+/i, /\bTOASTPOS\b/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^TST\s*\*/i],
      },
      confidence: 0.9,
    },
    {
      processor: 'Clover',
      patterns: [/^CLOVER\s+/i, /^CLV\*/i, /\bCLOVER\b.*\*/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^CL\w+\s*\*/i],
      },
      confidence: 0.85,
    },
    {
      processor: 'Shop Pay',
      patterns: [/^SHOP\s*PAY/i, /^SHOPIFY/i, /^SHOP\*/i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^SHOP(?:IFY|PAY)?\s*\*/i],
      },
      confidence: 0.8,
    },
    {
      processor: 'Klarna',
      patterns: [/^KLARNA/i],
      extractionRules: {
        method: 'regex',
        regex: /KLARNA[:\s*]+(.+)$/i,
      },
      confidence: 0.8,
    },
    {
      processor: 'Afterpay',
      patterns: [/^AFTERPAY/i, /^AFTPY/i],
      extractionRules: {
        method: 'regex',
        regex: /(?:AFTERPAY|AFTPY)[:\s*]+(.+)$/i,
      },
      confidence: 0.8,
    },
    {
      processor: 'Apple Pay',
      patterns: [/^APPLE\s*PAY/i, /^APL\*\s*/i],
      extractionRules: {
        method: 'position',
        position: 2,
        cleanupPatterns: [/^APPLE\s*PAY\s*/i, /^APL\*\s*/i],
      },
      confidence: 0.75,
    },
    {
      processor: 'Google Pay',
      patterns: [/^GOOGLE\s*PAY/i, /^GOOGLE\s*\*/i, /^G\.CO\//i],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^GOOGLE\s*\w*\s*\*/i],
      },
      confidence: 0.8,
    },
  ];

  private vendorMappings: Record<string, string> = {
    GRUBHUB: 'Grubhub',
    DOORDASH: 'DoorDash',
    UBEREATS: 'Uber Eats',
    'UBER EATS': 'Uber Eats',
    INSTACART: 'Instacart',
    EBAY: 'eBay',
    ETSY: 'Etsy',
    SUBSTACK: 'Substack',
    PATREON: 'Patreon',
    MEDIUM: 'Medium',
    NOTION: 'Notion',
    CANVA: 'Canva',
    ONLYFANS: 'OnlyFans',
    FANSLY: 'Fansly',
    TWITCH: 'Twitch',
    DISCORD: 'Discord',
    GITHUB: 'GitHub',
    CHATGPT: 'ChatGPT',
    OPENAI: 'OpenAI',
    SPOTIFY: 'Spotify',
    NETFLIX: 'Netflix',
  };

  private suspiciousDescriptors = [
    /^PAYMENT$/i,
    /^TRANSFER$/i,
    /^PURCHASE$/i,
    /^TRANSACTION$/i,
    /^CHARGE$/i,
    /^DEBIT$/i,
    /^POS\s+PURCHASE$/i,
    /^ONLINE\s+PAYMENT$/i,
    /^WEB\s+PAYMENT$/i,
    /^RECURRING$/i,
    /^\d+$/,
    /^[A-Z]{2,4}\d+$/,
  ];

  private categoryHints: Record<string, string[]> = {
    'Food & Dining': ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'tacos', 'deli', 'bakery', 'kitchen', 'grill', 'diner', 'grubhub', 'doordash'],
    Transportation: ['uber', 'lyft', 'taxi', 'parking', 'toll', 'metro', 'transit'],
    Entertainment: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'games', 'theater', 'cinema'],
    Shopping: ['amazon', 'ebay', 'etsy', 'walmart', 'target', 'shop', 'store'],
    Subscriptions: ['subscription', 'membership', 'premium', 'substack', 'patreon'],
    'Software & Services': ['github', 'openai', 'chatgpt', 'notion', 'adobe', 'microsoft'],
    Gaming: ['steam', 'xbox', 'playstation', 'nintendo', 'twitch', 'discord'],
  };

  unmaskVendor(description: string, extendedDetails?: string, statementDescription?: string): UnmaskedVendor {
    const allDescriptions = [description, extendedDetails, statementDescription].filter(Boolean).join(' ');

    for (const processor of this.processorPatterns) {
      for (const pattern of processor.patterns) {
        if (pattern.test(description)) {
          return this.extractFromProcessor(description, processor, allDescriptions);
        }
      }
    }

    if (this.suspiciousDescriptors.some((pattern) => pattern.test(description))) {
      return {
        originalDescription: description,
        processor: 'Unknown',
        extractedVendor: this.attemptVendorRecovery(allDescriptions),
        confidence: 0.3,
        metadata: {
          extractionMethod: 'suspicious_pattern',
          isObscured: true,
          needsManualReview: true,
          possibleVendors: this.suggestPossibleVendors(allDescriptions),
        },
      };
    }

    return {
      originalDescription: description,
      processor: 'Direct',
      extractedVendor: description,
      confidence: 1.0,
      category: this.inferCategory(description),
      metadata: {
        extractionMethod: 'direct',
        isObscured: false,
        needsManualReview: false,
      },
    };
  }

  generateObscuredVendorReport(unmaskedVendors: UnmaskedVendor[]): UnmaskingReport {
    const obscured = unmaskedVendors.filter((vendor) => vendor.metadata.isObscured);
    const needingReview = obscured.filter((vendor) => vendor.metadata.needsManualReview);
    const byProcessor: Record<string, number> = {};

    for (const vendor of obscured) {
      byProcessor[vendor.processor] = (byProcessor[vendor.processor] || 0) + 1;
    }

    const patternCounts = new Map<string, string[]>();
    for (const vendor of needingReview) {
      const pattern = this.identifyPattern(vendor.extractedVendor);
      const examples = patternCounts.get(pattern) ?? [];
      examples.push(vendor.originalDescription);
      patternCounts.set(pattern, examples);
    }

    return {
      totalObscured: obscured.length,
      byProcessor,
      needingReview: needingReview.slice(0, 50),
      suspiciousPatterns: Array.from(patternCounts.entries())
        .map(([pattern, examples]) => ({
          pattern,
          count: examples.length,
          examples: examples.slice(0, 3),
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  private extractFromProcessor(
    description: string,
    processor: ProcessorPattern,
    fullContext: string
  ): UnmaskedVendor {
    let extractedVendor = '';
    const { extractionRules } = processor;

    switch (extractionRules.method) {
      case 'delimiter':
        extractedVendor = this.extractByDelimiter(description, extractionRules.delimiter!, extractionRules.cleanupPatterns);
        break;
      case 'position':
        extractedVendor = this.extractByPosition(description, extractionRules.position!, extractionRules.cleanupPatterns);
        break;
      case 'regex':
        extractedVendor = this.extractByRegex(description, extractionRules.regex!, extractionRules.cleanupPatterns);
        break;
      case 'lookup':
        extractedVendor = this.extractByLookup(fullContext);
        break;
    }

    extractedVendor = this.cleanVendorName(extractedVendor);
    extractedVendor = this.lookupKnownVendor(extractedVendor) ?? extractedVendor;

    const needsReview =
      extractedVendor.length < 3 ||
      this.isSuspiciousExtraction(extractedVendor) ||
      processor.confidence < 0.8;

    return {
      originalDescription: description,
      processor: processor.processor,
      extractedVendor: extractedVendor || 'Unknown Vendor',
      confidence: extractedVendor ? processor.confidence : 0.1,
      category: this.inferCategory(extractedVendor || fullContext),
      metadata: {
        extractionMethod: extractionRules.method,
        isObscured: true,
        needsManualReview: needsReview,
        possibleVendors: needsReview ? this.suggestPossibleVendors(fullContext) : undefined,
      },
    };
  }

  private extractByDelimiter(text: string, delimiter: string, cleanupPatterns?: RegExp[]): string {
    const parts = text.split(delimiter);
    if (parts.length < 2) return this.applyCleanup(text, cleanupPatterns);
    return this.applyCleanup(parts.slice(1).join(delimiter).trim(), cleanupPatterns);
  }

  private extractByPosition(text: string, position: number, cleanupPatterns?: RegExp[]): string {
    const cleaned = this.applyCleanup(text, cleanupPatterns);
    return cleaned.split(/\s+/).slice(position).join(' ');
  }

  private extractByRegex(text: string, regex: RegExp, cleanupPatterns?: RegExp[]): string {
    const match = text.match(regex);
    if (!match?.[1]) return '';
    return this.applyCleanup(match[1].trim(), cleanupPatterns);
  }

  private extractByLookup(fullContext: string): string {
    const contextLower = fullContext.toLowerCase();
    for (const [key, vendor] of Object.entries(this.vendorMappings)) {
      if (contextLower.includes(key.toLowerCase())) return vendor;
    }
    return '';
  }

  private applyCleanup(vendor: string, cleanupPatterns?: RegExp[]): string {
    let cleaned = vendor;
    for (const pattern of cleanupPatterns ?? []) {
      cleaned = cleaned.replace(pattern, '').trim();
    }
    return cleaned;
  }

  private cleanVendorName(vendor: string): string {
    const cleaned = vendor
      .replace(/\s+\d{4,}$/, '')
      .replace(/\s+#\d+$/, '')
      .replace(/\s+LLC$/i, '')
      .replace(/\s+INC\.?$/i, '')
      .replace(/\s+CORP\.?$/i, '')
      .replace(/[^\w\s&'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return cleaned
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private lookupKnownVendor(vendor: string): string | null {
    const vendorUpper = vendor.toUpperCase();
    if (this.vendorMappings[vendorUpper]) return this.vendorMappings[vendorUpper]!;

    const keys = Object.keys(this.vendorMappings).sort((a, b) => b.length - a.length);
    for (const key of keys) {
      if (key.length < 4) continue;
      if (vendorUpper.includes(key) || key.includes(vendorUpper)) {
        return this.vendorMappings[key]!;
      }
    }
    return null;
  }

  private isSuspiciousExtraction(vendor: string): boolean {
    return (
      /^[0-9]+$/.test(vendor) ||
      vendor.length < 3 ||
      /^[A-Z]{2,4}$/.test(vendor) ||
      this.suspiciousDescriptors.some((pattern) => pattern.test(vendor))
    );
  }

  private attemptVendorRecovery(fullContext: string): string {
    const cleaned = fullContext
      .replace(/\b\d{4,}\b/g, '')
      .replace(/\b(PAYMENT|TRANSFER|PURCHASE)\b/gi, '');

    const emailMatch = cleaned.match(/[\w.-]+@[\w.-]+/);
    if (emailMatch) {
      return this.cleanVendorName(emailMatch[0].split('@')[1]!.split('.')[0]!);
    }

    const urlMatch = cleaned.match(/[\w-]+\.(?:com|net|org|io)/i);
    if (urlMatch) {
      return this.cleanVendorName(urlMatch[0].split('.')[0]!);
    }

    const words = cleaned.split(/\s+/).filter((word) => word.length > 2 && /^[A-Z]/.test(word));
    return words.length > 0 ? words.join(' ') : 'Unknown Vendor';
  }

  private suggestPossibleVendors(context: string): string[] {
    const suggestions = new Set<string>();
    const contextLower = context.toLowerCase();

    for (const [vendor, mapped] of Object.entries(this.vendorMappings)) {
      if (contextLower.includes(vendor.toLowerCase())) suggestions.add(mapped);
    }

    for (const [category, keywords] of Object.entries(this.categoryHints)) {
      if (keywords.some((keyword) => contextLower.includes(keyword))) {
        suggestions.add(`Likely ${category}`);
        break;
      }
    }

    return Array.from(suggestions).slice(0, 5);
  }

  private inferCategory(text: string): string {
    const textLower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(this.categoryHints)) {
      if (keywords.some((keyword) => textLower.includes(keyword))) return category;
    }
    return 'Other';
  }

  private identifyPattern(text: string): string {
    if (/^[0-9]+$/.test(text)) return 'Numeric only';
    if (/^[A-Z]{2,5}$/.test(text)) return 'Uppercase abbreviation';
    if (text.length < 3) return 'Too short';
    if (this.suspiciousDescriptors.some((pattern) => pattern.test(text))) return 'Generic descriptor';
    return 'Other suspicious';
  }
}
