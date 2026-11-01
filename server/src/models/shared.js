import mongoose from 'mongoose';

const { Schema } = mongoose;

// { key, label, iconKey }: used for choices and collection items
export const itemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    iconKey: { type: String, required: true },
  },
  { _id: false },
);

export const oneOf = (values) => ({
  validator: (v) => values.includes(v),
  message: (props) => `${props.path} must be one of: ${values.join(', ')}`,
});