// VendorUnmasker - Exposes real vendors hidden behind payment processors
// This module identifies and extracts actual business names from obscured transactions

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

interface UnmaskedVendor {
  originalDescription: string;
  processor: string;
  extractedVendor: string;
  confidence: number;
  category?: string;
  metadata: {
    extractionMethod: string;
    isObscured: boolean;
    needsManualReview: boolean;
    possibleVendors?: string[];
  };
}

export class VendorUnmasker {
  // Payment processor detection patterns
  private processorPatterns: ProcessorPattern[] = [
    {
      processor: 'PayPal',
      patterns: [
        /^PAYPAL\s*\*/i,
        /^PP\*\d+/i,
        /^PAYPAL\s+/i,
        /\bPAYPAL\b.*\*/i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^PAYPAL\s*\*/i, /^\d+\s*/]
      },
      confidence: 0.9
    },
    {
      processor: 'Square',
      patterns: [
        /^SQ\s*\*/i,
        /^SQUARE\s*\*/i,
        /^SQU\*\d+/i,
        /\bSQUARE\b.*\*/i,
        /^GOSQ\.COM/i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^SQ\w*\s*\*/i, /^\d+\s*/]
      },
      confidence: 0.9
    },
    {
      processor: 'Stripe',
      patterns: [
        /^STRIPE/i,
        /^STR\*/i,
        /\bSTRIPE\.COM\b/i,
        /STRIPE\s+CHARGE/i
      ],
      extractionRules: {
        method: 'regex',
        regex: /(?:STR\*|STRIPE[:\s]+)(.+?)(?:\s+\d{10,})?$/i,
        cleanupPatterns: [/\s+CHARGE$/i]
      },
      confidence: 0.85
    },
    {
      processor: 'Venmo',
      patterns: [
        /^VENMO\s+/i,
        /^VENMO\s*\*/i,
        /\bVENMO\b.*PAYMENT/i
      ],
      extractionRules: {
        method: 'position',
        position: 1,
        cleanupPatterns: [/^VENMO\s+/i, /\s+PAYMENT$/i]
      },
      confidence: 0.8
    },
    {
      processor: 'CashApp',
      patterns: [
        /^CASH\s*APP/i,
        /^CASH-APP/i,
        /^CA\*\d+/i,
        /\bCASHAPP\b/i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^CA\w*\s*\*/i]
      },
      confidence: 0.85
    },
    {
      processor: 'Zelle',
      patterns: [
        /^ZELLE\s+/i,
        /\bZELLE\b.*PAYMENT/i,
        /^ZELLE\s*TO\s+/i
      ],
      extractionRules: {
        method: 'regex',
        regex: /ZELLE\s+(?:TO\s+)?(.+?)(?:\s+\d{10,})?$/i
      },
      confidence: 0.8
    },
    {
      processor: 'Toast',
      patterns: [
        /^TST\*/i,
        /^TOAST\s+/i,
        /\bTOASTPOS\b/i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^TST\s*\*/i]
      },
      confidence: 0.9
    },
    {
      processor: 'Clover',
      patterns: [
        /^CLOVER\s+/i,
        /^CLV\*/i,
        /\bCLOVER\b.*\*/i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^CL\w+\s*\*/i]
      },
      confidence: 0.85
    },
    {
      processor: 'Apple Pay',
      patterns: [
        /^APPLE\s*PAY/i,
        /^APL\*\s*/i,
        /\bAPPLE\.COM\/BILL\b/i
      ],
      extractionRules: {
        method: 'position',
        position: 2,
        cleanupPatterns: [/^APPLE\s*PAY\s*/i]
      },
      confidence: 0.75
    },
    {
      processor: 'Google Pay',
      patterns: [
        /^GOOGLE\s*PAY/i,
        /^GOOGLE\s*\*/i,
        /^G\.CO\//i
      ],
      extractionRules: {
        method: 'delimiter',
        delimiter: '*',
        cleanupPatterns: [/^GOOGLE\s*\w*\s*\*/i]
      },
      confidence: 0.8
    }
  ];

  // Known vendor mappings from obscured names
  private vendorMappings: Record<string, string> = {
    // Common PayPal merchants
    'GRUBHUB': 'Grubhub Food Delivery',
    'DOORDASH': 'DoorDash Food Delivery',
    'UBEREATS': 'Uber Eats',
    'INSTACART': 'Instacart Grocery Delivery',
    'EBAY': 'eBay Marketplace',
    'ETSY': 'Etsy Marketplace',
    
    // Common Square merchants (often local businesses)
    'COFFEE': 'Local Coffee Shop',
    'CAFE': 'Local Cafe',
    'RESTAURANT': 'Local Restaurant',
    'BOUTIQUE': 'Local Boutique',
    'SALON': 'Local Salon',
    'BARBER': 'Local Barber Shop',
    
    // Subscription services often through Stripe
    'SUBSTACK': 'Substack Newsletter',
    'PATREON': 'Patreon Creator Support',
    'MEDIUM': 'Medium Subscription',
    'NOTION': 'Notion Workspace',
    'CANVA': 'Canva Design Tool',
    
    // Other common obscured vendors
    'ONLYFANS': 'OnlyFans Subscription',
    'OF': 'OnlyFans Subscription',
    'FANSLY': 'Fansly Subscription',
    'TWITCH': 'Twitch Subscription',
    'DISCORD': 'Discord Nitro',
    'GITHUB': 'GitHub Subscription',
    'CHATGPT': 'ChatGPT Plus',
    'OPENAI': 'OpenAI Services'
  };

  // Suspicious or vague descriptors that need investigation
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
    /^\d+$/,  // Just numbers
    /^[A-Z]{2,4}\d+$/  // Like "AB123"
  ];

  // Category hints based on keywords
  private categoryHints: Record<string, string[]> = {
    'Food & Dining': ['restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'tacos', 'deli', 'bakery', 'kitchen', 'grill', 'diner'],
    'Transportation': ['uber', 'lyft', 'taxi', 'parking', 'toll', 'metro', 'transit'],
    'Entertainment': ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'games', 'theater', 'cinema'],
    'Shopping': ['amazon', 'ebay', 'etsy', 'walmart', 'target', 'shop', 'store', 'boutique'],
    'Subscriptions': ['subscription', 'monthly', 'annual', 'membership', 'premium', 'pro', 'plus'],
    'Adult Content': ['onlyfans', 'of', 'fansly', 'manyvids', 'chaturbate', 'cam'],
    'Crypto/Trading': ['coinbase', 'binance', 'kraken', 'robinhood', 'etrade', 'crypto', 'bitcoin'],
    'Gaming': ['steam', 'xbox', 'playstation', 'nintendo', 'epic', 'twitch', 'discord']
  };

  unmaskVendor(description: string, extendedDetails?: string, statementDescription?: string): UnmaskedVendor {
    const originalDescription = description;
    
    // Check all available fields for additional context
    const allDescriptions = [description, extendedDetails, statementDescription].filter(Boolean).join(' ');
    
    // First, check if this is a payment processor transaction
    for (const processor of this.processorPatterns) {
      for (const pattern of processor.patterns) {
        if (pattern.test(description)) {
          return this.extractFromProcessor(description, processor, allDescriptions);
        }
      }
    }
    
    // Check if it's a suspicious generic descriptor
    const isSuspicious = this.suspiciousDescriptors.some(pattern => pattern.test(description));
    
    if (isSuspicious) {
      return {
        originalDescription,
        processor: 'Unknown',
        extractedVendor: this.attemptVendorRecovery(allDescriptions),
        confidence: 0.3,
        metadata: {
          extractionMethod: 'suspicious_pattern',
          isObscured: true,
          needsManualReview: true,
          possibleVendors: this.suggestPossibleVendors(allDescriptions)
        }
      };
    }
    
    // Not obscured, return as is
    return {
      originalDescription,
      processor: 'Direct',
      extractedVendor: description,
      confidence: 1.0,
      category: this.inferCategory(description),
      metadata: {
        extractionMethod: 'direct',
        isObscured: false,
        needsManualReview: false
      }
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
        extractedVendor = this.extractByDelimiter(
          description, 
          extractionRules.delimiter!,
          extractionRules.cleanupPatterns
        );
        break;
        
      case 'position':
        extractedVendor = this.extractByPosition(
          description,
          extractionRules.position!,
          extractionRules.cleanupPatterns
        );
        break;
        
      case 'regex':
        extractedVendor = this.extractByRegex(
          description,
          extractionRules.regex!,
          extractionRules.cleanupPatterns
        );
        break;
        
      case 'lookup':
        extractedVendor = this.extractByLookup(fullContext);
        break;
    }
    
    // Clean up extracted vendor name
    extractedVendor = this.cleanVendorName(extractedVendor);
    
    // Check if we have a known mapping
    const mappedVendor = this.lookupKnownVendor(extractedVendor);
    if (mappedVendor) {
      extractedVendor = mappedVendor;
    }
    
    // Determine if manual review is needed
    const needsReview = extractedVendor.length < 3 || 
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
        possibleVendors: needsReview ? this.suggestPossibleVendors(fullContext) : undefined
      }
    };
  }

  private extractByDelimiter(
    text: string, 
    delimiter: string,
    cleanupPatterns?: RegExp[]
  ): string {
    const parts = text.split(delimiter);
    if (parts.length < 2) return '';
    
    // Usually the vendor is after the delimiter
    let vendor = parts[1]!.trim();
    
    // Apply cleanup patterns
    if (cleanupPatterns) {
      for (const pattern of cleanupPatterns) {
        vendor = vendor.replace(pattern, '').trim();
      }
    }
    
    return vendor;
  }

  private extractByPosition(
    text: string,
    position: number,
    cleanupPatterns?: RegExp[]
  ): string {
    let vendor = text;
    
    // Apply cleanup patterns first
    if (cleanupPatterns) {
      for (const pattern of cleanupPatterns) {
        vendor = vendor.replace(pattern, '').trim();
      }
    }
    
    // Split and get position
    const parts = vendor.split(/\s+/);
    return parts.slice(position).join(' ');
  }

  private extractByRegex(
    text: string,
    regex: RegExp,
    cleanupPatterns?: RegExp[]
  ): string {
    const match = text.match(regex);
    if (!match || !match[1]) return '';
    
    let vendor = match[1].trim();
    
    // Apply cleanup patterns
    if (cleanupPatterns) {
      for (const pattern of cleanupPatterns) {
        vendor = vendor.replace(pattern, '').trim();
      }
    }
    
    return vendor;
  }

  private extractByLookup(fullContext: string): string {
    // Look for known vendor names in the full context
    const contextLower = fullContext.toLowerCase();
    
    for (const [key, vendor] of Object.entries(this.vendorMappings)) {
      if (contextLower.includes(key.toLowerCase())) {
        return vendor;
      }
    }
    
    return '';
  }

  private cleanVendorName(vendor: string): string {
    // Remove common suffixes and clean up
    vendor = vendor
      .replace(/\s+\d{4,}$/, '') // Remove trailing numbers
      .replace(/\s+#\d+$/, '') // Remove store numbers
      .replace(/\s+LLC$/i, '')
      .replace(/\s+INC$/i, '')
      .replace(/\s+CORP$/i, '')
      .replace(/[^\w\s&'-]/g, ' ') // Keep only alphanumeric and some special chars
      .replace(/\s+/g, ' ')
      .trim();
    
    // Title case
    return vendor.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private lookupKnownVendor(vendor: string): string | null {
    const vendorUpper = vendor.toUpperCase();
    
    // Direct lookup
    if (this.vendorMappings[vendorUpper]) {
      return this.vendorMappings[vendorUpper];
    }
    
    // Partial match lookup
    for (const [key, mapped] of Object.entries(this.vendorMappings)) {
      if (vendorUpper.includes(key) || key.includes(vendorUpper)) {
        return mapped;
      }
    }
    
    return null;
  }

  private isSuspiciousExtraction(vendor: string): boolean {
    // Check if extraction resulted in suspicious content
    return /^[0-9]+$/.test(vendor) || // All numbers
           vendor.length < 3 || // Too short
           /^[A-Z]{2,4}$/.test(vendor) || // Just uppercase letters
           this.suspiciousDescriptors.some(pattern => pattern.test(vendor));
  }

  private attemptVendorRecovery(fullContext: string): string {
    // Try to recover vendor from context using various heuristics
    
    // Remove common noise
    let cleaned = fullContext
      .replace(/\b\d{4,}\b/g, '') // Remove long numbers
      .replace(/\bPAYMENT\b/gi, '')
      .replace(/\bTRANSFER\b/gi, '')
      .replace(/\bPURCHASE\b/gi, '');
    
    // Look for email-like patterns
    const emailMatch = cleaned.match(/[\w.-]+@[\w.-]+/);
    if (emailMatch) {
      const domain = emailMatch[0].split('@')[1]!.split('.')[0]!;
      return this.cleanVendorName(domain);
    }
    
    // Look for URL-like patterns
    const urlMatch = cleaned.match(/[\w-]+\.(?:com|net|org|io)/i);
    if (urlMatch) {
      const domain = urlMatch[0].split('.')[0]!;
      return this.cleanVendorName(domain);
    }
    
    // Look for capitalized words that might be vendor names
    const words = cleaned.split(/\s+/).filter(word => 
      word.length > 2 && /^[A-Z]/.test(word)
    );
    
    if (words.length > 0) {
      return words.join(' ');
    }
    
    return 'Unknown Vendor';
  }

  private suggestPossibleVendors(context: string): string[] {
    const suggestions = new Set<string>();
    const contextLower = context.toLowerCase();
    
    // Check against known vendor keywords
    for (const [vendor, mapped] of Object.entries(this.vendorMappings)) {
      if (contextLower.includes(vendor.toLowerCase())) {
        suggestions.add(mapped);
      }
    }
    
    // Check category hints
    for (const [category, keywords] of Object.entries(this.categoryHints)) {
      for (const keyword of keywords) {
        if (contextLower.includes(keyword)) {
          suggestions.add(`Likely ${category} vendor`);
          break;
        }
      }
    }
    
    // Add generic suggestions based on amount patterns
    if (context.match(/\$\d+\.\d{2}/)) {
      const amount = parseFloat(context.match(/\$(\d+\.\d{2})/)?.[1] || '0');
      
      if (amount >= 5 && amount <= 15) {
        suggestions.add('Possible food/coffee purchase');
      } else if (amount >= 9.99 && amount <= 19.99 && amount % 1 === 0.99) {
        suggestions.add('Possible subscription service');
      }
    }
    
    return Array.from(suggestions).slice(0, 5);
  }

  private inferCategory(text: string): string {
    const textLower = text.toLowerCase();
    
    for (const [category, keywords] of Object.entries(this.categoryHints)) {
      for (const keyword of keywords) {
        if (textLower.includes(keyword)) {
          return category;
        }
      }
    }
    
    return 'Other';
  }

  // Generate report of obscured vendors for manual review
  generateObscuredVendorReport(unmaskedVendors: UnmaskedVendor[]): {
    totalObscured: number;
    byProcessor: Record<string, number>;
    needingReview: UnmaskedVendor[];
    suspiciousPatterns: { pattern: string; count: number; examples: string[] }[];
  } {
    const obscured = unmaskedVendors.filter(v => v.metadata.isObscured);
    const needingReview = obscured.filter(v => v.metadata.needsManualReview);
    
    // Count by processor
    const byProcessor: Record<string, number> = {};
    for (const vendor of obscured) {
      byProcessor[vendor.processor] = (byProcessor[vendor.processor] || 0) + 1;
    }
    
    // Find suspicious patterns
    const patternCounts = new Map<string, string[]>();
    for (const vendor of needingReview) {
      const pattern = this.identifyPattern(vendor.extractedVendor);
      if (!patternCounts.has(pattern)) {
        patternCounts.set(pattern, []);
      }
      patternCounts.get(pattern)!.push(vendor.originalDescription);
    }
    
    const suspiciousPatterns = Array.from(patternCounts.entries())
      .map(([pattern, examples]) => ({
        pattern,
        count: examples.length,
        examples: examples.slice(0, 3)
      }))
      .sort((a, b) => b.count - a.count);
    
    return {
      totalObscured: obscured.length,
      byProcessor,
      needingReview: needingReview.slice(0, 50), // Top 50 for review
      suspiciousPatterns
    };
  }

  private identifyPattern(text: string): string {
    if (/^[0-9]+$/.test(text)) return 'Numeric only';
    if (/^[A-Z]{2,5}$/.test(text)) return 'Uppercase abbreviation';
    if (text.length < 3) return 'Too short';
    if (this.suspiciousDescriptors.some(p => p.test(text))) return 'Generic descriptor';
    return 'Other suspicious';
  }
}