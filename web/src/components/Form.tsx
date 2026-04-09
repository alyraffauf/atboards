import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const inputStyles =
  "w-full bg-neutral-900 border border-neutral-800 rounded px-3 py-2 " +
  "text-neutral-200 placeholder-neutral-500 focus:outline-none focus:border-neutral-600";

const buttonStyles =
  "bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-4 py-2 rounded";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={`${inputStyles} ${className ?? ""}`} {...rest} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return (
    <textarea className={`${inputStyles} resize-y ${className ?? ""}`} {...rest} />
  );
}

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props;
  return <button className={`${buttonStyles} ${className ?? ""}`} {...rest} />;
}
