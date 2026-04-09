import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.literal("self"),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("xyz.atboards.site"),
    bannedDids: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    ),
    boards: /*#__PURE__*/ v.array(/*#__PURE__*/ v.string()),
    createdAt: /*#__PURE__*/ v.datetimeString(),
    /**
     * @maxLength 1000
     */
    description: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 1000),
    ]),
    hiddenPosts: /*#__PURE__*/ v.optional(
      /*#__PURE__*/ v.array(/*#__PURE__*/ v.resourceUriString()),
    ),
    /**
     * @maxLength 5000
     */
    intro: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 5000),
    ]),
    /**
     * @maxLength 100
     */
    name: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 100),
    ]),
    updatedAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  }),
);

type main$schematype = typeof _mainSchema;

export interface mainSchema extends main$schematype {}

export const mainSchema = _mainSchema as mainSchema;

export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "xyz.atboards.site": mainSchema;
  }
}
