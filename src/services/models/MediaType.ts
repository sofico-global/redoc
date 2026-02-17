import * as Sampler from 'openapi-sampler';
import { makeObservable, computed } from 'mobx';

import type { OpenAPIMediaType } from '../../types';
import type { RedocNormalizedOptions } from '../RedocNormalizedOptions';
import {
  SchemaModel,
  getSchemaWithActiveDiscriminators,
  collectActiveDiscriminatorSelections,
  applyDiscriminatorValues,
} from './Schema';

import { isJsonLike, mapValues } from '../../utils';
import type { OpenAPIParser } from '../OpenAPIParser';
import { ExampleModel } from './Example';

export class MediaTypeModel {
  schema?: SchemaModel;
  name: string;
  isRequestType: boolean;
  onlyRequiredInSamples: boolean;
  generatedSamplesMaxDepth: number;

  // Store these for reactive example generation
  private _staticExamples?: { [name: string]: ExampleModel };
  private _parser?: OpenAPIParser;
  private _encoding?: OpenAPIMediaType['encoding'];
  private _shouldGenerateExamples: boolean = false;

  /**
   * @param isRequestType needed to know if skipe RO/RW fields in objects
   */
  constructor(
    parser: OpenAPIParser,
    name: string,
    isRequestType: boolean,
    info: OpenAPIMediaType,
    options: RedocNormalizedOptions,
  ) {
    this.name = name;
    this.isRequestType = isRequestType;
    this.schema = info.schema && new SchemaModel(parser, info.schema, '', options);
    this.onlyRequiredInSamples = options.onlyRequiredInSamples;
    this.generatedSamplesMaxDepth = options.generatedSamplesMaxDepth;

    // Store parser and encoding for reactive example generation
    this._parser = parser;
    this._encoding = info.encoding;

    if (info.examples !== undefined) {
      this._staticExamples = mapValues(
        info.examples,
        example => new ExampleModel(parser, example, name, info.encoding),
      );
    } else if (info.example !== undefined) {
      this._staticExamples = {
        default: new ExampleModel(
          parser,
          { value: parser.deref(info.example).resolved },
          name,
          info.encoding,
        ),
      };
    } else if (isJsonLike(name)) {
      this._shouldGenerateExamples = true;
    }

    makeObservable(this, {
      examples: computed,
    });
  }

  /**
   * Examples are computed to react to nested discriminator changes.
   * When a nested discriminator's activeOneOf changes, examples will regenerate.
   */
  get examples(): { [name: string]: ExampleModel } | undefined {
    // If static examples were provided, return them
    if (this._staticExamples) {
      return this._staticExamples;
    }

    // If we shouldn't generate examples, return undefined
    if (!this._shouldGenerateExamples || !this.schema || !this._parser) {
      return undefined;
    }

    // IMPORTANT: Collect all active discriminator selections to register MobX dependencies.
    // This ensures the computed re-runs when ANY nested discriminator selection changes.
    collectActiveDiscriminatorSelections(this.schema);

    return this.generateExamples();
  }

  private generateExamples(): { [name: string]: ExampleModel } | undefined {
    if (!this.schema || !this._parser) {
      return undefined;
    }

    const samplerOptions = {
      skipReadOnly: this.isRequestType,
      skipWriteOnly: !this.isRequestType,
      skipNonRequired: this.isRequestType && this.onlyRequiredInSamples,
      maxSampleDepth: this.generatedSamplesMaxDepth,
    };

    // If root schema has oneOf (discriminator at root level), generate example for each variant
    if (this.schema.oneOf && this.schema.oneOf.length > 0) {
      const examples: { [name: string]: ExampleModel } = {};

      for (const subSchema of this.schema.oneOf) {
        // Use the resolved schema that respects nested discriminator selections
        const resolvedSchema = getSchemaWithActiveDiscriminators(subSchema);
        const sample = Sampler.sample(resolvedSchema as any, samplerOptions, this._parser.spec);

        // Set the discriminator property value for root level
        if (this.schema.discriminatorProp && typeof sample === 'object' && sample) {
          sample[this.schema.discriminatorProp] = subSchema.title;
        }

        // Apply discriminator values for nested discriminators (post-sampling)
        applyDiscriminatorValues(sample, subSchema);

        examples[subSchema.title] = new ExampleModel(
          this._parser,
          { value: sample },
          this.name,
          this._encoding,
        );
      }

      return examples;
    }

    // No root-level oneOf - generate a single example using resolved schema
    const resolvedSchema = getSchemaWithActiveDiscriminators(this.schema);
    const sample = Sampler.sample(resolvedSchema as any, samplerOptions, this._parser.spec);

    // Apply discriminator values for any nested discriminators (post-sampling)
    applyDiscriminatorValues(sample, this.schema);

    return {
      default: new ExampleModel(this._parser, { value: sample }, this.name, this._encoding),
    };
  }
}
