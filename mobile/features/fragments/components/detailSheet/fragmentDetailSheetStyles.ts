import { StyleSheet } from 'react-native';

/*集中维护碎片详情抽屉 section 样式，避免区块组件重复声明。 */
export const fragmentDetailSheetStyles = StyleSheet.create({
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  audioSection: {
    marginBottom: 4,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
  },
  toolIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  toolCopy: {
    flex: 1,
    marginRight: 10,
  },
  toolTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  toolSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
  },
  infoCard: {
    borderRadius: 18,
    padding: 14,
  },
  infoRow: {
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  infoValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  summaryText: {
    marginTop: 8,
    fontSize: 16,
    lineHeight: 24,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  tagText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  deleteButton: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
  },
});
