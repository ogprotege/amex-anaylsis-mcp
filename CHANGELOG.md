# Changelog

All notable changes to the AmexAnalysis-MCP project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] - 2025-01-15

### Fixed
- **Repository URL**: Updated all references from `amex-analysis-mcp` to `amex-anaylsis-mcp` throughout the codebase
- **Test Execution**: Fixed test timeout issue by modifying `amex-mcp-server.ts:1548-1552` to only start the MCP server when run directly
- **Vendor Unmasking**: Improved vendor unmasking in `amex-vendor-unmasker.ts:73-77` to properly handle both `STR*` and `STRIPE` patterns

### Added
- **Test Coverage**: Created `test-unmasking.ts` with comprehensive vendor unmasking tests

### Changed
- Verified all functionality after repository URL update

## [2.0.0] - 2024-01-15

### 🎉 Major Release: Vendor Unmasking Technology

#### Added
- **Vendor Unmasking Engine**: Revolutionary pattern recognition system that reveals real merchants hidden behind payment processors
  - Supports 10+ major payment processors (PayPal, Square, Stripe, Toast, Venmo, etc.)
  - Intelligent extraction algorithms with confidence scoring
  - Manual review flagging for uncertain extractions
  - Context-aware vendor suggestions based on transaction patterns

- **Enhanced Excel Exports**:
  - New "Obscured Vendors" sheet showing all payment processor transactions
  - Confidence scores and extraction details
  - Manual review instructions and suggestions
  - Payment processor usage statistics

- **TypeScript Migration**: 
  - Full TypeScript implementation for better type safety
  - Comprehensive type definitions for all data structures
  - Better IDE support and autocomplete

- **Improved Analysis Engine**:
  - Smarter subscription detection with pattern variance analysis
  - Enhanced fraud detection with multi-layer validation
  - Better category inference with expanded keyword database
  - Duplicate transaction detection across vendors

#### Changed
- Migrated from JavaScript to TypeScript
- Improved vendor normalization algorithm
- Enhanced recurring pattern detection accuracy
- Better handling of edge cases in CSV parsing
- More detailed insights and recommendations

#### Fixed
- Currency parsing issues with different formats
- Date handling for various CSV export formats
- Memory efficiency for large transaction sets
- Excel export formatting issues

## [1.5.0] - 2023-12-01

### Added
- MCP (Model Context Protocol) integration
- Support for Claude Desktop
- Batch processing capabilities
- JSON export format
- Command-line interface improvements

### Changed
- Refactored core analysis engine for better performance
- Improved subscription detection algorithm
- Enhanced categorization rules

### Fixed
- CSV parsing errors with special characters
- Timezone handling issues
- Excel export memory leaks

## [1.0.0] - 2023-10-15

### Initial Release

#### Features
- Basic Amex CSV parsing
- Vendor spending analysis
- Simple subscription detection
- Excel export functionality
- Category-based spending breakdown
- Top vendor identification
- Basic fraud detection

#### Known Limitations
- No payment processor detection
- Limited subscription patterns
- Basic Excel formatting
- English-only support

## [0.5.0-beta] - 2023-09-01

### Beta Release
- Proof of concept for Amex transaction analysis
- Basic CSV parsing functionality
- Simple vendor aggregation
- Initial subscription detection logic

---

## Roadmap for Future Releases

### [2.1.0] - Planned
- Machine learning-based vendor identification
- Support for multiple credit card formats (Chase, Citi, etc.)
- Browser extension for real-time analysis
- Mobile app companion

### [2.2.0] - Planned
- Receipt matching and itemization
- Budget tracking and alerts
- Spending forecasts and trends
- Multi-currency support

### [3.0.0] - Planned
- AI-powered financial insights
- Integration with accounting software
- Automated expense categorization
- Tax preparation assistance

## Migration Guide

### From 1.x to 2.0

1. **File Structure Changes**:
   ```bash
   # Old structure
   server.js
   vendor-unmasker.js
   
   # New structure
   amex-mcp-server.ts
   amex-vendor-unmasker.ts
   ```

2. **Import Changes**:
   ```typescript
   // Old
   import { AmexSpendingAnalyzer } from './server.js';
   
   // New
   import { AmexSpendingAnalyzer } from './amex-mcp-server.js';
   ```

3. **Configuration Updates**:
   ```json
   // Update Claude Desktop config
   {
     "mcpServers": {
       "amex-analysis": {
         "command": "node",
         "args": ["path/to/dist/amex-mcp-server.js"]
       }
     }
   }
   ```

4. **New Dependencies**:
   ```bash
   npm install typescript tsx @types/node @types/papaparse
   ```

## Support

For issues, feature requests, or questions:
- Create an issue on GitHub
- Check the CHEATSHEET.md for common solutions
- Review the comprehensive README.md for detailed documentation