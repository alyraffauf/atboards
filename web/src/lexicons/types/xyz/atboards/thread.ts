import type {} from "@atcute/lexicons";
import * as v from "@atcute/lexicons/validations";
import type {} from "@atcute/lexicons/ambient";

const _attachmentSchema = /*#__PURE__*/ v.object({
  $type: /*#__PURE__*/ v.optional(
    /*#__PURE__*/ v.literal("xyz.atboards.thread#attachment"),
  ),
  /**
   * @accept *\/*
   * @maxSize 1000000
   */
  file: /*#__PURE__*/ v.blob(),
  /**
   * @maxLength 256
   */
  name: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
    /*#__PURE__*/ v.stringLength(0, 256),
  ]),
});
const _mainSchema = /*#__PURE__*/ v.record(
  /*#__PURE__*/ v.tidString(),
  /*#__PURE__*/ v.object({
    $type: /*#__PURE__*/ v.literal("xyz.atboards.thread"),
    get attachments() {
      return /*#__PURE__*/ v.optional(/*#__PURE__*/ v.array(attachmentSchema));
    },
    board: /*#__PURE__*/ v.resourceUriString(),
    /**
     * @maxLength 10000
     */
    body: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 10000),
    ]),
    createdAt: /*#__PURE__*/ v.datetimeString(),
    /**
     * @maxLength 300
     */
    title: /*#__PURE__*/ v.constrain(/*#__PURE__*/ v.string(), [
      /*#__PURE__*/ v.stringLength(0, 300),
    ]),
    updatedAt: /*#__PURE__*/ v.optional(/*#__PURE__*/ v.datetimeString()),
  }),
);

type attachment$schematype = typeof _attachmentSchema;
type main$schematype = typeof _mainSchema;

export interface attachmentSchema extends attachment$schematype {}
export interface mainSchema extends main$schematype {}

export const attachmentSchema = _attachmentSchema as attachmentSchema;
export const mainSchema = _mainSchema as mainSchema;

export interface Attachment extends v.InferInput<typeof attachmentSchema> {}
export interface Main extends v.InferInput<typeof mainSchema> {}

declare module "@atcute/lexicons/ambient" {
  interface Records {
    "xyz.atboards.thread": mainSchema;
  }
}
